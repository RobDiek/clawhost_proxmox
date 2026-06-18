/**
 * Content Plan Metrics Collector (Phase B)
 *
 * Pulls real engagement/reach metrics from platform APIs for content plan
 * items that have been published. Updates `item.results` in researchData.
 *
 * Channels supported in this MVP:
 *   - facebook  → Graph API /{post-id}/insights
 *   - instagram → Graph API /{media-id}/insights
 *
 * To be added (Phase B.2):
 *   - google_ads, meta_ads → respective Ads APIs (ad-level metrics)
 *   - blog/wordpress     → GA4 / GSC joined on URL
 *   - email              → email provider stats
 *
 * Called from: POST /hosting/instances/:id/metrics/collect (manual or cron)
 */

import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq } from 'drizzle-orm'

interface ItemResults {
    reach?: number
    impressions?: number
    clicks?: number
    ctr?: number
    engagement?: number
    engagementRate?: number
    conversions?: number
    revenueIls?: number
    fetchedAt?: string
}

interface PlanItem {
    id: string
    channel: string
    date: string
    publishedAt?: string
    channelPostId?: string
    results?: ItemResults
    performanceScore?: number
    status: string
    hook?: string
}

export interface CollectResult {
    fetched: number
    skipped: number
    failed: number
    updates: Array<{ id: string; channel: string; results?: ItemResults; error?: string }>
}

/**
 * Facebook Page post metrics.
 * Permissions: pages_read_engagement (tied to the pageAccessToken).
 */
async function fetchFacebookInsights(postId: string, pageToken: string): Promise<ItemResults | null> {
    const metrics = [
        'post_impressions',
        'post_impressions_unique',
        'post_clicks',
        'post_reactions_by_type_total',
    ].join(',')
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(postId)}/insights?metric=${metrics}&access_token=${encodeURIComponent(pageToken)}`

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) {
            const err = await res.text()
            console.warn(`FB insights ${postId} failed ${res.status}: ${err.substring(0, 200)}`)
            return null
        }
        const data = await res.json() as { data?: Array<{ name: string; values: Array<{ value: unknown }> }> }
        const result: ItemResults = {}
        ;(data.data || []).forEach(m => {
            const v = m.values?.[0]?.value
            if (m.name === 'post_impressions' && typeof v === 'number') result.impressions = v
            else if (m.name === 'post_impressions_unique' && typeof v === 'number') result.reach = v
            else if (m.name === 'post_clicks' && typeof v === 'number') result.clicks = v
            else if (m.name === 'post_reactions_by_type_total' && typeof v === 'object' && v) {
                // v = { like: 5, love: 2, haha: 1, ... }
                const sum = Object.values(v as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0)
                result.engagement = sum
            }
        })
        if (result.impressions && result.clicks !== undefined) {
            result.ctr = result.impressions > 0 ? result.clicks / result.impressions : 0
        }
        if (result.reach && result.engagement !== undefined) {
            result.engagementRate = result.reach > 0 ? result.engagement / result.reach : 0
        }
        result.fetchedAt = new Date().toISOString()
        return result
    } catch (err) {
        console.warn(`FB insights ${postId} network error:`, (err as Error).message)
        return null
    }
}

/**
 * Google Search Console metrics for a blog post URL.
 * Pulls last 28 days of search analytics filtered to the specific page.
 * Returns clicks/impressions/ctr/position averages + top keywords embedded
 * in the engagement field as a comma-separated summary (agents can read it).
 *
 * Permissions: webmasters.readonly scope (already requested at connect time).
 * gscTokens shape: { accessToken, refreshToken, siteUrl, sites[], ... }
 */
async function fetchBlogInsights(url: string, gscTokens: Record<string, unknown>): Promise<ItemResults | null> {
    const accessToken = gscTokens?.accessToken as string | undefined
    const siteUrl = gscTokens?.siteUrl as string | undefined
    if (!accessToken || !siteUrl) return null

    const endDate = new Date()
    const startDate = new Date(Date.now() - 28 * 24 * 3600 * 1000)
    const queryUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

    try {
        const res = await fetch(queryUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                startDate: startDate.toISOString().slice(0, 10),
                endDate: endDate.toISOString().slice(0, 10),
                dimensions: ['query'],
                dimensionFilterGroups: [{
                    filters: [{ dimension: 'page', operator: 'equals', expression: url }],
                }],
                rowLimit: 10,
            }),
            signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) {
            const err = await res.text()
            console.warn(`GSC insights ${url} failed ${res.status}: ${err.substring(0, 200)}`)
            return null
        }
        const data = await res.json() as {
            rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>
        }
        const rows = data.rows || []
        if (rows.length === 0) {
            return { impressions: 0, clicks: 0, ctr: 0, fetchedAt: new Date().toISOString() }
        }
        let totalClicks = 0
        let totalImpressions = 0
        rows.forEach(r => {
            totalClicks += r.clicks
            totalImpressions += r.impressions
        })
        return {
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
            // reach ≈ impressions for SEO (no unique-user data from GSC)
            reach: totalImpressions,
            fetchedAt: new Date().toISOString(),
        }
    } catch (err) {
        console.warn(`GSC insights ${url} network error:`, (err as Error).message)
        return null
    }
}

/**
 * Instagram media metrics.
 * Permissions: instagram_basic + instagram_manage_insights on the IG account.
 */
async function fetchInstagramInsights(mediaId: string, pageToken: string): Promise<ItemResults | null> {
    const metrics = ['reach', 'impressions', 'likes', 'comments', 'saved'].join(',')
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}/insights?metric=${metrics}&access_token=${encodeURIComponent(pageToken)}`

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) {
            const err = await res.text()
            console.warn(`IG insights ${mediaId} failed ${res.status}: ${err.substring(0, 200)}`)
            return null
        }
        const data = await res.json() as { data?: Array<{ name: string; values: Array<{ value: unknown }> }> }
        const result: ItemResults = {}
        let likes = 0, comments = 0, saved = 0
        ;(data.data || []).forEach(m => {
            const v = m.values?.[0]?.value
            if (typeof v !== 'number') return
            if (m.name === 'reach') result.reach = v
            else if (m.name === 'impressions') result.impressions = v
            else if (m.name === 'likes') likes = v
            else if (m.name === 'comments') comments = v
            else if (m.name === 'saved') saved = v
        })
        result.engagement = likes + comments + saved
        if (result.reach && result.engagement) {
            result.engagementRate = result.reach > 0 ? result.engagement / result.reach : 0
        }
        result.fetchedAt = new Date().toISOString()
        return result
    } catch (err) {
        console.warn(`IG insights ${mediaId} network error:`, (err as Error).message)
        return null
    }
}

/**
 * Compute a composite performance score 0-100.
 * Heuristic: blend reach (vs plan expectation) + engagement rate + CTR.
 * Used in prompts/UI for quick "how did this perform" badges.
 */
function computePerformanceScore(r: ItemResults): number {
    let score = 0
    let parts = 0
    if (typeof r.engagementRate === 'number') {
        // 5%+ engagement rate = top tier
        score += Math.min(100, r.engagementRate * 2000)
        parts++
    }
    if (typeof r.ctr === 'number') {
        // 2%+ CTR = top tier for organic
        score += Math.min(100, r.ctr * 5000)
        parts++
    }
    if (typeof r.reach === 'number' && r.reach > 0) {
        // log-scale reach — 10K reach = ~80pt
        score += Math.min(100, Math.log10(r.reach + 1) * 25)
        parts++
    }
    return parts > 0 ? Math.round(score / parts) : 0
}

// ═══════════════════════════════════════════════════════════════════════════
// Cron starter — daily metrics sweep across all live instances
// Called from index.ts at startup. Runs 10min after boot, then every 24h.
// ═══════════════════════════════════════════════════════════════════════════
const COLLECT_INTERVAL_MS = 24 * 3600 * 1000
let _collectStarted = false
export function startMetricsCollectorCron(): void {
    if (_collectStarted) return
    _collectStarted = true
    console.log(`[metricsCollector] starting (interval ${COLLECT_INTERVAL_MS / 3600_000}h)`)
    setTimeout(() => { collectAllInstances().catch(err => console.error('[metricsCollector] startup run failed:', err)) }, 10 * 60 * 1000)
    setInterval(() => { collectAllInstances().catch(err => console.error('[metricsCollector] interval run failed:', err)) }, COLLECT_INTERVAL_MS)
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-Optimization Cron — the "marketing manager under the hood"
//
// Every 7 days, for each instance with ≥5 measured items in researchData:
//   1. Run collectContentPlanMetrics (fresh data)
//   2. Invoke generateOptimizationReportCore (Opus 4.7 thinking synthesis)
//   3. Store result in researchData.optimizationReports[]
//
// The stored report is then automatically consumed by:
//   - Content Plan regen (Skeleton prompt injection)
//   - planDraftRunner (item drafting context)
//   - Daily brief / weekly report (when agent asks about performance)
//
// No UI trigger — user never sees the report directly. They see its EFFECT
// (sharper content plans, smarter drafts, performance-aware briefs).
// ═══════════════════════════════════════════════════════════════════════════
const OPTIMIZATION_INTERVAL_MS = 7 * 24 * 3600 * 1000 // weekly
const FIRST_OPTIMIZATION_DELAY_MS = 2 * 3600 * 1000   // 2h after boot (let metrics collect first)
let _optimizationStarted = false

export function startOptimizationCron(): void {
    if (_optimizationStarted) return
    _optimizationStarted = true
    console.log(`[autoOptimization] starting (weekly; first run in ${FIRST_OPTIMIZATION_DELAY_MS / 3600_000}h)`)
    setTimeout(() => { optimizeAllInstances().catch(err => console.error('[autoOptimization] startup run failed:', err)) }, FIRST_OPTIMIZATION_DELAY_MS)
    setInterval(() => { optimizeAllInstances().catch(err => console.error('[autoOptimization] interval run failed:', err)) }, OPTIMIZATION_INTERVAL_MS)
}

async function optimizeAllInstances(): Promise<void> {
    const { generateOptimizationReportCore } = await import('@/controllers/hosting/agentSetup')
    const { isPipelineEnabled } = await import('./pipelineActivation')
    const { listAgentsForInstance, readResearchData } = await import('./agentContext')
    const live = await db.select({ id: instances.id }).from(instances)
    let generated = 0
    let skipped = 0
    let skippedDisabled = 0
    for (const row of live) {
        // Per-agent: each agent gets its OWN optimization report from its own
        // measured content plan (not the primary's).
        const agents = await listAgentsForInstance(row.id)
        for (const agent of (agents.length ? agents : [null])) {
            try {
                // Gate: optimization synthesis is content-driven (consumes
                // contentPlan results). Skip when content_calendar disabled.
                const enabled = await isPipelineEnabled(row.id, 'content_calendar', agent)
                if (!enabled) { skippedDisabled++; continue }
                const rd = ((await readResearchData(agent, row.id)) as Record<string, unknown> | null) || {}
                const plan = (Array.isArray(rd.contentPlan) ? rd.contentPlan : []) as Array<{ results?: { engagement?: number } }>
                const measured = plan.filter(it => it.results && typeof it.results.engagement === 'number').length
                if (measured < 5) { skipped++; continue }

                // Fresh metrics first
                await collectContentPlanMetrics(row.id, agent?.id).catch(() => { /* non-fatal */ })
                // Then optimization synthesis
                await generateOptimizationReportCore(row.id, agent?.id)
                generated++
                console.log(`[autoOptimization] ${row.id}/${agent?.id || 'primary'}: report generated (${measured} measured items)`)
            } catch (err) {
                console.warn(`[autoOptimization] ${row.id}/${agent?.id || 'primary'} error:`, (err as Error).message)
            }
        }
    }
    if (skippedDisabled > 0) {
        console.log(`[autoOptimization] skipped ${skippedDisabled} tenant(s) — content_calendar pipeline disabled`)
    }
    console.log(`[autoOptimization] sweep done: ${generated} generated, ${skipped} skipped (insufficient data)`)
}

async function collectAllInstances(): Promise<void> {
    const live = await db.select({ id: instances.id }).from(instances)
    console.log(`[metricsCollector] sweep: ${live.length} instances`)
    let totalFetched = 0
    let totalFailed = 0
    let totalSkipped = 0
    const { isPipelineEnabled } = await import('./pipelineActivation')
    const { listAgentsForInstance } = await import('./agentContext')
    for (const row of live) {
        // Per-agent: process EACH agent's content plan (a multi-agent VPS has
        // secondary brands with their own plans/tokens — not just the primary).
        const agents = await listAgentsForInstance(row.id)
        for (const agent of (agents.length ? agents : [null])) {
            try {
                // Gate: metrics collector pulls performance for content_calendar
                // outputs (IG/FB posts, blog articles via GSC). Skip agents
                // where content_calendar is disabled — saves API calls.
                const enabled = await isPipelineEnabled(row.id, 'content_calendar', agent)
                if (!enabled) { totalSkipped++; continue }
                const res = await collectContentPlanMetrics(row.id, agent?.id)
                totalFetched += res.fetched
                totalFailed += res.failed
                if (res.fetched > 0) {
                    console.log(`[metricsCollector] ${row.id}/${agent?.id || 'primary'}: fetched=${res.fetched} skipped=${res.skipped} failed=${res.failed}`)
                }
            } catch (err) {
                console.warn(`[metricsCollector] ${row.id}/${agent?.id || 'primary'} error:`, (err as Error).message)
                totalFailed++
            }
        }
    }
    if (totalSkipped > 0) {
        console.log(`[metricsCollector] skipped ${totalSkipped} tenant(s) — content_calendar pipeline disabled`)
    }
    console.log(`[metricsCollector] sweep done: +${totalFetched} fetched, ${totalFailed} failed`)
}

export async function collectContentPlanMetrics(instanceId: string, agentId?: string | null): Promise<CollectResult> {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instance) throw new Error('Instance not found')

    // Per-agent: a secondary agent has its OWN content plan + Meta/GSC tokens.
    // Resolve the active agent (cron callers pass none → primary); read/write
    // its research_data and read its publishing tokens, not the instance mirror.
    const { resolveAgentById, resolvePrimaryAgent, readResearchData, writeResearchData } = await import('@/services/agentContext')
    const __cmAgent = agentId
        ? (await resolveAgentById(instanceId, agentId)) || (await resolvePrimaryAgent(instanceId))
        : await resolvePrimaryAgent(instanceId)
    const rd = ((await readResearchData(__cmAgent, instanceId)) as Record<string, unknown>) || {}
    const plan = (Array.isArray(rd.contentPlan) ? rd.contentPlan : []) as PlanItem[]
    const metaTokens = ((__cmAgent as { metaTokens?: Record<string, unknown> } | null)?.metaTokens ?? (instance.metaTokens as Record<string, unknown> | null)) || {}
    const pageToken = (metaTokens.pageAccessToken || metaTokens.userAccessToken || metaTokens.accessToken) as string | undefined
    const gscTokens = ((__cmAgent as { gscTokens?: Record<string, unknown> } | null)?.gscTokens ?? (instance.gscTokens as Record<string, unknown> | null)) || null

    const updates: CollectResult['updates'] = []
    let fetched = 0, skipped = 0, failed = 0

    for (const item of plan) {
        if (item.status !== 'published' || !item.channelPostId) { skipped++; continue }

        let result: ItemResults | null = null
        const anyItem = item as PlanItem & { channelPostUrl?: string }
        if (item.channel === 'facebook') {
            if (!pageToken) { skipped++; updates.push({ id: item.id, channel: item.channel, error: 'no Meta token' }); continue }
            result = await fetchFacebookInsights(item.channelPostId, pageToken)
        } else if (item.channel === 'instagram') {
            if (!pageToken) { skipped++; updates.push({ id: item.id, channel: item.channel, error: 'no Meta token' }); continue }
            result = await fetchInstagramInsights(item.channelPostId, pageToken)
        } else if (item.channel === 'blog') {
            // For blog items we use the full URL (channelPostUrl) to query GSC.
            if (!gscTokens || !anyItem.channelPostUrl) { skipped++; updates.push({ id: item.id, channel: item.channel, error: gscTokens ? 'no URL' : 'no GSC token' }); continue }
            result = await fetchBlogInsights(anyItem.channelPostUrl, gscTokens)
        } else {
            // Unsupported channel in this MVP (linkedin/email/youtube/tiktok/ads)
            skipped++
            continue
        }

        if (result) {
            item.results = { ...(item.results || {}), ...result }
            item.performanceScore = computePerformanceScore(item.results)
            updates.push({ id: item.id, channel: item.channel, results: item.results })
            fetched++
        } else {
            failed++
            updates.push({ id: item.id, channel: item.channel, error: 'fetch failed' })
        }
    }

    // Persist plan only if any item was updated (via agent-aware writer)
    if (fetched > 0) {
        await writeResearchData(__cmAgent, instanceId, { ...(rd as object), contentPlan: plan, metricsLastCollectedAt: new Date().toISOString() } as never)
    }

    return { fetched, skipped, failed, updates }
}