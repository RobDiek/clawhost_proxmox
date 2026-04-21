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

export async function collectContentPlanMetrics(instanceId: string): Promise<CollectResult> {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instance) throw new Error('Instance not found')

    const rd = (instance.researchData as Record<string, unknown>) || {}
    const plan = (Array.isArray(rd.contentPlan) ? rd.contentPlan : []) as PlanItem[]
    const metaTokens = (instance.metaTokens as Record<string, unknown> | null) || {}
    const pageToken = (metaTokens.pageAccessToken || metaTokens.userAccessToken || metaTokens.accessToken) as string | undefined

    const updates: CollectResult['updates'] = []
    let fetched = 0, skipped = 0, failed = 0

    for (const item of plan) {
        if (item.status !== 'published' || !item.channelPostId) { skipped++; continue }

        let result: ItemResults | null = null
        if (item.channel === 'facebook') {
            if (!pageToken) { skipped++; updates.push({ id: item.id, channel: item.channel, error: 'no Meta token' }); continue }
            result = await fetchFacebookInsights(item.channelPostId, pageToken)
        } else if (item.channel === 'instagram') {
            if (!pageToken) { skipped++; updates.push({ id: item.id, channel: item.channel, error: 'no Meta token' }); continue }
            result = await fetchInstagramInsights(item.channelPostId, pageToken)
        } else {
            // Unsupported channel in this MVP
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

    // Persist plan only if any item was updated
    if (fetched > 0) {
        await db.update(instances).set({
            researchData: { ...(rd as object), contentPlan: plan, metricsLastCollectedAt: new Date().toISOString() } as unknown as Record<string, unknown>,
        }).where(eq(instances.id, instanceId))
    }

    return { fetched, skipped, failed, updates }
}