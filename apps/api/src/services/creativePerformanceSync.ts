/**
 * Creative Performance Sync (Phase B5)
 *
 * Daily cron that pulls ad metrics from Meta + Google Ads for every active
 * platform_creative_mapping and stores daily rows in creative_performance.
 *
 * Pipeline:
 *   1. Query all active mappings for running instances
 *   2. Group by (instance, platform, account) to minimize API calls
 *   3. Fetch yesterday's metrics per creative_id
 *   4. Upsert into creative_performance (unique key = render+platform+creativeId+date)
 *   5. For each render with new data: analyzeFatigue() → maybe emit alert
 *
 * Fatigue thresholds (Phase B5 MVP):
 *   - frequency > 3.5 (Meta 7d window)
 *   - CTR drop > 20% vs 7d baseline
 *   - CPM spike > 30% vs 7d baseline
 *
 * Rate limits:
 *   - Meta Insights: 200 calls/hour/token — batch via `fields=spend,impressions,...`
 *   - Google Ads:    15k operations/day — minimal
 *
 * Runs daily at 04:00 UTC (so Meta's T-1 data is finalized).
 */

import { randomBytes } from 'crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
    instances,
    creativePerformance,
    platformCreativeMappings,
    creativeFatigueAlerts,
    creativeRenders,
} from '@/db/schema'

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000   // daily
const genId = () => 'p_' + randomBytes(6).toString('hex')

// Fatigue thresholds — configurable later per-instance
const FATIGUE = {
    FREQUENCY_MAX: 3.5,
    CTR_DROP_PCT: 0.20,    // 20% drop vs 7d baseline
    CPM_SPIKE_PCT: 0.30,   // 30% spike
    MIN_IMPRESSIONS_FOR_FATIGUE: 1000,   // don't alert below meaningful volume
    BASELINE_DAYS: 7,
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry — daily cron
// ═══════════════════════════════════════════════════════════════════════════

export async function syncAllInstancesPerformance(): Promise<{
    instances: number
    syncedMappings: number
    newRows: number
    fatigueAlerts: number
    errors: number
}> {
    const t0 = Date.now()
    const stats = { instances: 0, syncedMappings: 0, newRows: 0, fatigueAlerts: 0, errors: 0 }

    try {
        // Find all running instances with active mappings
        const instanceIds = await db
            .selectDistinct({ id: platformCreativeMappings.instanceId })
            .from(platformCreativeMappings)
            .where(eq(platformCreativeMappings.isActive, true))

        for (const { id: instanceId } of instanceIds) {
            stats.instances++
            try {
                const res = await syncInstancePerformance(instanceId)
                stats.syncedMappings += res.syncedMappings
                stats.newRows += res.newRows
                stats.fatigueAlerts += res.fatigueAlerts
            } catch (err) {
                stats.errors++
                console.error(`[perfSync] instance ${instanceId} failed:`, err)
            }
        }

        console.log(`[perfSync] done in ${Date.now() - t0}ms — ${JSON.stringify(stats)}`)
    } catch (err) {
        console.error('[perfSync] top-level error:', err)
        stats.errors++
    }

    return stats
}

// ═══════════════════════════════════════════════════════════════════════════
// Single-instance sync
// ═══════════════════════════════════════════════════════════════════════════

export async function syncInstancePerformance(instanceId: string): Promise<{
    syncedMappings: number
    newRows: number
    fatigueAlerts: number
}> {
    const result = { syncedMappings: 0, newRows: 0, fatigueAlerts: 0 }

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error(`instance ${instanceId} not found`)

    const mappings = await db.select().from(platformCreativeMappings)
        .where(and(
            eq(platformCreativeMappings.instanceId, instanceId),
            eq(platformCreativeMappings.isActive, true),
        ))
    if (mappings.length === 0) return result

    // Group by (platform, accountId) so each API call covers multiple creatives
    type Group = typeof platformCreativeMappings.$inferSelect[]
    const groups = new Map<string, Group>()
    for (const m of mappings) {
        const key = `${m.platform}:${m.platformAccountId}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(m)
    }

    for (const [key, group] of groups) {
        const [platform] = key.split(':')
        try {
            let perfRows: NormalizedPerformance[] = []
            if (platform === 'meta') {
                perfRows = await fetchMetaInsights(inst, group)
            } else if (platform === 'google_ads') {
                perfRows = await fetchGoogleAdsInsights(inst, group)
            } else {
                console.log(`[perfSync] ${instanceId} platform ${platform} not yet supported`)
                continue
            }

            // Upsert into creative_performance
            for (const row of perfRows) {
                const inserted = await upsertPerformance(instanceId, row)
                if (inserted) result.newRows++
            }

            // Mark mappings as synced
            const mappingIds = group.map(m => m.id)
            if (mappingIds.length > 0) {
                await db.update(platformCreativeMappings)
                    .set({ lastSyncedAt: new Date(), lastSyncError: null, updatedAt: new Date() })
                    .where(inArray(platformCreativeMappings.id, mappingIds))
            }
            result.syncedMappings += mappingIds.length
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            console.error(`[perfSync] ${instanceId} ${key} fetch failed:`, errMsg)
            // Record error on mappings so UI can surface
            const mappingIds = group.map(m => m.id)
            if (mappingIds.length > 0) {
                await db.update(platformCreativeMappings)
                    .set({ lastSyncError: errMsg.substring(0, 500), updatedAt: new Date() })
                    .where(inArray(platformCreativeMappings.id, mappingIds))
            }
        }
    }

    // Fatigue analysis — only on renders that got new data today
    const renderIds = [...new Set(mappings.map(m => m.renderId))]
    for (const renderId of renderIds) {
        const alertCreated = await analyzeFatigue(instanceId, renderId)
        if (alertCreated) result.fatigueAlerts++
    }

    return result
}

// ═══════════════════════════════════════════════════════════════════════════
// Meta Ads Insights fetcher
// ═══════════════════════════════════════════════════════════════════════════

interface NormalizedPerformance {
    renderId: string
    platform: string
    platformCreativeId: string
    measurementDate: string   // YYYY-MM-DD
    spend: number
    impressions: number
    clicks: number
    reach: number
    frequency: number | null
    ctr: number | null
    cpc: number | null
    cpm: number | null
    currency: string
    videoPlays: number
    videoP25: number
    videoP50: number
    videoP75: number
    videoP100: number
    hookRate: number | null
    holdRate: number | null
    conversions: number
    conversionValue: number
    roas: number | null
    raw: unknown
}

async function fetchMetaInsights(
    inst: typeof instances.$inferSelect,
    group: typeof platformCreativeMappings.$inferSelect[],
): Promise<NormalizedPerformance[]> {
    const mt = (inst.metaTokens as any) || {}
    const token = mt.userAccessToken || mt.pageAccessToken || mt.accessToken
    if (!token) throw new Error('Meta access token missing')

    // Meta Ads Insights API — fetch per ad_id for yesterday (T-1)
    // Date range: use 'yesterday' preset
    const fields = [
        'ad_id', 'ad_name', 'date_start', 'date_stop',
        'spend', 'impressions', 'clicks', 'reach', 'frequency',
        'ctr', 'cpc', 'cpm',
        'video_play_actions', 'video_p25_watched_actions', 'video_p50_watched_actions',
        'video_p75_watched_actions', 'video_p100_watched_actions',
        'actions', 'action_values',
        'account_currency',
    ].join(',')

    const results: NormalizedPerformance[] = []

    // Batch by ad account — one call per account returns ads in that account.
    // Filter by ad_ids via `filtering` param.
    const byAccount = new Map<string, typeof group>()
    for (const m of group) {
        const acc = m.platformAccountId
        if (!byAccount.has(acc)) byAccount.set(acc, [])
        byAccount.get(acc)!.push(m)
    }

    for (const [accountId, accMappings] of byAccount) {
        const adIds = accMappings.map(m => m.platformCreativeId)
        const filtering = JSON.stringify([{
            field: 'ad.id',
            operator: 'IN',
            value: adIds,
        }])
        const qp = new URLSearchParams({
            access_token: token,
            level: 'ad',
            fields,
            date_preset: 'yesterday',
            filtering,
            limit: '500',
        })
        const acctPrefix = accountId.startsWith('act_') ? accountId : `act_${accountId}`
        const url = `https://graph.facebook.com/v20.0/${acctPrefix}/insights?${qp.toString()}`

        const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
        if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Meta Insights HTTP ${res.status}: ${errText.substring(0, 300)}`)
        }
        const data = await res.json() as { data?: unknown[] }
        if (!data.data) continue

        for (const row of data.data) {
            const r = row as Record<string, unknown>
            const adId = String(r.ad_id || '')
            const mapping = accMappings.find(m => m.platformCreativeId === adId)
            if (!mapping) continue   // shouldn't happen, safeguard

            const actions = Array.isArray(r.actions) ? r.actions as Array<{ action_type: string; value: string }> : []
            const actionValues = Array.isArray(r.action_values) ? r.action_values as Array<{ action_type: string; value: string }> : []
            const videoPlays = toInt(r.video_play_actions, 0)
            const videoP50 = toInt(r.video_p50_watched_actions, 0)
            const impressions = parseInt(String(r.impressions || 0), 10) || 0
            const spend = parseFloat(String(r.spend || 0))

            // Conversions: sum `purchase` and `lead` actions (covers most clients)
            const conversions = actions
                .filter(a => ['purchase', 'lead', 'complete_registration', 'submit_application'].includes(a.action_type))
                .reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0)
            const conversionValue = actionValues
                .filter(a => a.action_type === 'purchase')
                .reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0)

            results.push({
                renderId: mapping.renderId,
                platform: 'meta',
                platformCreativeId: adId,
                measurementDate: String(r.date_start || ''),
                spend,
                impressions,
                clicks: parseInt(String(r.clicks || 0), 10) || 0,
                reach: parseInt(String(r.reach || 0), 10) || 0,
                frequency: r.frequency ? parseFloat(String(r.frequency)) : null,
                ctr: r.ctr ? parseFloat(String(r.ctr)) / 100 : null,   // Meta returns CTR as %
                cpc: r.cpc ? parseFloat(String(r.cpc)) : null,
                cpm: r.cpm ? parseFloat(String(r.cpm)) : null,
                currency: String(r.account_currency || 'ILS'),
                videoPlays,
                videoP25: toInt(r.video_p25_watched_actions, 0),
                videoP50,
                videoP75: toInt(r.video_p75_watched_actions, 0),
                videoP100: toInt(r.video_p100_watched_actions, 0),
                hookRate: impressions > 0 ? videoPlays / impressions : null,
                holdRate: videoPlays > 0 ? videoP50 / videoPlays : null,
                conversions,
                conversionValue,
                roas: spend > 0 ? conversionValue / spend : null,
                raw: r,
            })
        }
    }
    return results
}

// Meta video action fields return arrays like [{ action_type: 'video_view', value: '123' }]
function toInt(val: unknown, fallback: number): number {
    if (typeof val === 'number') return Math.round(val)
    if (Array.isArray(val) && val.length > 0) {
        const v = val[0] as { value?: string }
        return v?.value ? (parseInt(v.value, 10) || fallback) : fallback
    }
    if (typeof val === 'string') return parseInt(val, 10) || fallback
    return fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Ads Insights fetcher
// ═══════════════════════════════════════════════════════════════════════════

async function fetchGoogleAdsInsights(
    inst: typeof instances.$inferSelect,
    group: typeof platformCreativeMappings.$inferSelect[],
): Promise<NormalizedPerformance[]> {
    // Lazy-load google-ads-api SDK to avoid import cost on instances not using it
    const { GoogleAdsApi } = await import('google-ads-api')

    const gt = (inst.googleTokens as any) || {}
    const refreshToken = gt.refreshToken || gt.refresh_token
    const cfg = (inst.googleAdsConfig as any) || {}
    if (!refreshToken) throw new Error('Google OAuth refresh_token missing')
    if (!cfg.developerToken) throw new Error('Google Ads developer token missing')

    const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        developer_token: cfg.developerToken,
    })

    const results: NormalizedPerformance[] = []
    const byAccount = new Map<string, typeof group>()
    for (const m of group) {
        if (!byAccount.has(m.platformAccountId)) byAccount.set(m.platformAccountId, [])
        byAccount.get(m.platformAccountId)!.push(m)
    }

    for (const [accountId, accMappings] of byAccount) {
        const customer = client.Customer({
            customer_id: accountId,
            refresh_token: refreshToken,
            login_customer_id: cfg.loginCustomerId || accountId,
        })

        // Build GAQL for ad_group_ad with yesterday metrics
        const adIds = accMappings.map(m => `'${m.platformCreativeId}'`).join(', ')
        const query = `
            SELECT
              ad_group_ad.ad.id,
              ad_group_ad.ad.name,
              segments.date,
              metrics.cost_micros,
              metrics.impressions,
              metrics.clicks,
              metrics.ctr,
              metrics.average_cpc,
              metrics.average_cpm,
              metrics.video_views,
              metrics.video_quartile_p25_rate,
              metrics.video_quartile_p50_rate,
              metrics.video_quartile_p75_rate,
              metrics.video_quartile_p100_rate,
              metrics.conversions,
              metrics.conversions_value
            FROM ad_group_ad
            WHERE
              segments.date DURING YESTERDAY
              AND ad_group_ad.ad.id IN (${adIds})
        `

        try {
            const rows = await customer.query(query) as Array<Record<string, any>>
            for (const row of rows) {
                const adIdRaw = row?.ad_group_ad?.ad?.id
                const adId = adIdRaw == null ? '' : String(adIdRaw)
                const mapping = accMappings.find(m => m.platformCreativeId === adId)
                if (!mapping) continue

                const spendMicros = Number(row?.metrics?.cost_micros || 0)
                const spend = spendMicros / 1_000_000
                const impressions = Number(row?.metrics?.impressions || 0)
                const clicks = Number(row?.metrics?.clicks || 0)
                const videoPlays = Number(row?.metrics?.video_views || 0)
                const videoP50Rate = Number(row?.metrics?.video_quartile_p50_rate || 0)
                const conversions = Number(row?.metrics?.conversions || 0)
                const conversionValue = Number(row?.metrics?.conversions_value || 0)

                results.push({
                    renderId: mapping.renderId,
                    platform: 'google_ads',
                    platformCreativeId: adId,
                    measurementDate: String(row?.segments?.date || ''),
                    spend,
                    impressions,
                    clicks,
                    reach: 0,    // Google Ads doesn't report reach at ad level — 0 = unknown
                    frequency: null,
                    ctr: impressions > 0 ? clicks / impressions : null,
                    cpc: clicks > 0 ? spend / clicks : null,
                    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
                    currency: 'ILS',
                    videoPlays,
                    videoP25: Math.round(videoPlays * Number(row?.metrics?.video_quartile_p25_rate || 0) / 100),
                    videoP50: Math.round(videoPlays * videoP50Rate / 100),
                    videoP75: Math.round(videoPlays * Number(row?.metrics?.video_quartile_p75_rate || 0) / 100),
                    videoP100: Math.round(videoPlays * Number(row?.metrics?.video_quartile_p100_rate || 0) / 100),
                    hookRate: impressions > 0 ? videoPlays / impressions : null,
                    holdRate: videoPlays > 0 ? (videoP50Rate / 100) : null,
                    conversions,
                    conversionValue,
                    roas: spend > 0 ? conversionValue / spend : null,
                    raw: row,
                })
            }
        } catch (err) {
            console.error(`[perfSync] Google Ads query failed for ${accountId}:`, err)
            throw err
        }
    }
    return results
}

// ═══════════════════════════════════════════════════════════════════════════
// Upsert + fatigue analysis
// ═══════════════════════════════════════════════════════════════════════════

async function upsertPerformance(instanceId: string, row: NormalizedPerformance): Promise<boolean> {
    if (!row.measurementDate || !row.platformCreativeId) return false

    // Use Drizzle ON CONFLICT pattern via raw SQL — the composite unique key is
    // (render_id, platform, platform_creative_id, measurement_date, measurement_window)
    try {
        await db.insert(creativePerformance).values({
            id: genId(),
            instanceId,
            renderId: row.renderId,
            platform: row.platform,
            platformCreativeId: row.platformCreativeId,
            measurementDate: row.measurementDate,
            measurementWindow: 'daily',
            spend: String(row.spend),
            impressions: row.impressions,
            clicks: row.clicks,
            reach: row.reach,
            frequency: row.frequency !== null ? String(row.frequency) : null,
            ctr: row.ctr !== null ? String(row.ctr) : null,
            cpc: row.cpc !== null ? String(row.cpc) : null,
            cpm: row.cpm !== null ? String(row.cpm) : null,
            currency: row.currency,
            videoPlays: row.videoPlays,
            videoP25: row.videoP25,
            videoP50: row.videoP50,
            videoP75: row.videoP75,
            videoP100: row.videoP100,
            hookRate: row.hookRate !== null ? String(row.hookRate) : null,
            holdRate: row.holdRate !== null ? String(row.holdRate) : null,
            conversions: String(row.conversions),
            conversionValue: String(row.conversionValue),
            roas: row.roas !== null ? String(row.roas) : null,
            raw: row.raw as any,
        })
        return true
    } catch (err) {
        // Likely unique violation — update existing row
        const errStr = err instanceof Error ? err.message : String(err)
        if (errStr.includes('duplicate') || errStr.includes('unique') || errStr.includes('23505')) {
            try {
                await db.update(creativePerformance)
                    .set({
                        spend: String(row.spend),
                        impressions: row.impressions,
                        clicks: row.clicks,
                        reach: row.reach,
                        frequency: row.frequency !== null ? String(row.frequency) : null,
                        ctr: row.ctr !== null ? String(row.ctr) : null,
                        cpc: row.cpc !== null ? String(row.cpc) : null,
                        cpm: row.cpm !== null ? String(row.cpm) : null,
                        videoPlays: row.videoPlays,
                        videoP25: row.videoP25,
                        videoP50: row.videoP50,
                        videoP75: row.videoP75,
                        videoP100: row.videoP100,
                        hookRate: row.hookRate !== null ? String(row.hookRate) : null,
                        holdRate: row.holdRate !== null ? String(row.holdRate) : null,
                        conversions: String(row.conversions),
                        conversionValue: String(row.conversionValue),
                        roas: row.roas !== null ? String(row.roas) : null,
                        raw: row.raw as any,
                        updatedAt: new Date(),
                    })
                    .where(and(
                        eq(creativePerformance.renderId, row.renderId),
                        eq(creativePerformance.platform, row.platform),
                        eq(creativePerformance.platformCreativeId, row.platformCreativeId),
                        eq(creativePerformance.measurementDate, row.measurementDate),
                        eq(creativePerformance.measurementWindow, 'daily'),
                    ))
                return false
            } catch (updateErr) {
                console.error(`[perfSync] upsert update failed for ${row.renderId}:`, updateErr)
                return false
            }
        }
        console.error(`[perfSync] upsert insert failed for ${row.renderId}:`, err)
        return false
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fatigue analysis
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeFatigue(instanceId: string, renderId: string): Promise<boolean> {
    // Get last 14 days of performance for this render (all platforms aggregated)
    const rows = await db.select().from(creativePerformance)
        .where(eq(creativePerformance.renderId, renderId))
        .orderBy(desc(creativePerformance.measurementDate))
        .limit(14)

    if (rows.length < 2) return false   // need at least baseline + today

    // Compute "today" (most recent) and baseline (prior 7 days)
    const today = rows[0]
    const baseline = rows.slice(1, 1 + FATIGUE.BASELINE_DAYS)
    if (baseline.length === 0) return false

    const todayImpressions = today.impressions || 0
    if (todayImpressions < FATIGUE.MIN_IMPRESSIONS_FOR_FATIGUE) return false

    const baselineAvg = (field: 'ctr' | 'cpm' | 'frequency') => {
        const vals = baseline.map(r => parseFloat(r[field] as string || '0') || 0).filter(v => v > 0)
        if (vals.length === 0) return 0
        return vals.reduce((a, b) => a + b, 0) / vals.length
    }

    const todayCtr = parseFloat((today.ctr as string) || '0') || 0
    const todayCpm = parseFloat((today.cpm as string) || '0') || 0
    const todayFreq = parseFloat((today.frequency as string) || '0') || 0

    const baseCtr = baselineAvg('ctr')
    const baseCpm = baselineAvg('cpm')

    const alerts: Array<{ reason: string; value: number; threshold: number; baseline: number }> = []

    // Frequency too high
    if (todayFreq > FATIGUE.FREQUENCY_MAX) {
        alerts.push({
            reason: 'frequency_high',
            value: todayFreq,
            threshold: FATIGUE.FREQUENCY_MAX,
            baseline: todayFreq,
        })
    }
    // CTR dropped significantly
    if (baseCtr > 0 && todayCtr < baseCtr * (1 - FATIGUE.CTR_DROP_PCT)) {
        alerts.push({
            reason: 'ctr_drop',
            value: todayCtr,
            threshold: baseCtr * (1 - FATIGUE.CTR_DROP_PCT),
            baseline: baseCtr,
        })
    }
    // CPM spike
    if (baseCpm > 0 && todayCpm > baseCpm * (1 + FATIGUE.CPM_SPIKE_PCT)) {
        alerts.push({
            reason: 'cpm_spike',
            value: todayCpm,
            threshold: baseCpm * (1 + FATIGUE.CPM_SPIKE_PCT),
            baseline: baseCpm,
        })
    }

    if (alerts.length === 0) return false

    // Create alerts (only if no open alert for same reason exists)
    let createdAny = false
    for (const alert of alerts) {
        const existing = await db.select({ id: creativeFatigueAlerts.id }).from(creativeFatigueAlerts)
            .where(and(
                eq(creativeFatigueAlerts.renderId, renderId),
                eq(creativeFatigueAlerts.triggerReason, alert.reason),
                eq(creativeFatigueAlerts.status, 'open'),
            ))
            .limit(1)
        if (existing.length > 0) continue   // already alerted

        await db.insert(creativeFatigueAlerts).values({
            id: 'fa_' + randomBytes(5).toString('hex'),
            instanceId,
            renderId,
            triggerReason: alert.reason,
            triggerValue: String(alert.value),
            triggerThreshold: String(alert.threshold),
            baselineValue: String(alert.baseline),
            status: 'open',
        })
        console.log(`[perfSync] fatigue alert for ${renderId}: ${alert.reason} value=${alert.value.toFixed(3)} baseline=${alert.baseline.toFixed(3)}`)
        createdAny = true
    }
    return createdAny
}

// ═══════════════════════════════════════════════════════════════════════════
// Cron starter (called from index.ts at startup)
// ═══════════════════════════════════════════════════════════════════════════

let started = false
export function startCreativePerformanceSync(): void {
    if (started) return
    started = true
    console.log(`[perfSync] starting (interval ${SYNC_INTERVAL_MS / 3600_000}h)`)
    // Initial run 2 min after startup (let server warm up)
    setTimeout(() => { syncAllInstancesPerformance().catch(() => { /* logged inside */ }) }, 2 * 60 * 1000)
    // Daily thereafter
    setInterval(() => { syncAllInstancesPerformance().catch(() => { /* logged inside */ }) }, SYNC_INTERVAL_MS)
}

// Utility export — allow keeping the `sql` import usage light
export { sql as _sql }
