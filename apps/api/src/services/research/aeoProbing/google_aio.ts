/**
 * Google AI Overview probing via DataForSEO SERP advanced endpoint.
 *
 * DFS's /serp/google/organic/live/advanced returns items[] with mixed
 * polymorphic shapes. AIO appears as item_type='ai_overview' WITH a
 * `references` array of cited URLs. This is the cleanest probing path:
 *
 *   - No new external dependency (DFS already integrated)
 *   - Cheap (~$0.002/probe for 100-result SERP page)
 *   - Honest "Google says X for Hebrew query Y" data
 *
 * Per DFS docs: AIO presence is conditional — Google only shows AIO for
 * a subset of queries (~47% English, ~20-25% Hebrew). Absence is not a
 * DFS failure; it's the engine's verdict.
 */

import { dfsPost } from '../dataforseo/client'
import { LOCATION_IL, LANGUAGE_HE } from '../dataforseo/types'
import { cacheGet, cacheSet } from '../dataforseo/cache'
import { isOurBrand, citationSharePct, type AeoProbeOpts, type AeoProbeBatchResult, type AeoProbeResult } from './index'

const SERP_ENDPOINT = 'serp/google/organic/live/advanced'

interface SerpAdvancedItem {
    item_type?: string
    rank_absolute?: number
    title?: string
    description?: string
    url?: string
    references?: Array<{ url?: string; domain?: string; title?: string }>
    items?: Array<{ text?: string }>
}

interface CachedAioResult {
    keyword: string
    cost: number
    items: SerpAdvancedItem[]
}

export async function probeGoogleAio(opts: AeoProbeOpts): Promise<AeoProbeBatchResult> {
    const maxProbes = opts.maxProbesPerEngine ?? opts.keywords.length
    const kws = opts.keywords.slice(0, maxProbes)
    const results: AeoProbeResult[] = []
    let totalCost = 0

    for (const keyword of kws) {
        // Pre-check budget if provided
        if (opts.budget && !opts.budget.canAfford(0.003)) {
            results.push(probeSkipped(keyword, 'budget_exhausted'))
            continue
        }

        const params = {
            keyword,
            location_code: LOCATION_IL,
            language_code: LANGUAGE_HE,
            device: 'mobile' as const,
            depth: 30,   // top-30 enough to capture AIO + most features
        }

        let items: SerpAdvancedItem[] = []
        let cost = 0
        let probedOk = false
        let errorMsg: string | undefined

        // Check cache
        const cached = await cacheGet<CachedAioResult>(opts.instanceId, SERP_ENDPOINT, params)
        if (cached) {
            items = cached.items
            cost = 0
            probedOk = true
            opts.budget?.recordCacheHit()
        } else {
            try {
                const { result, cost: callCost } = await dfsPost<{ items: SerpAdvancedItem[] }>(
                    opts.instanceId,
                    SERP_ENDPOINT,
                    [params],
                )
                items = result?.[0]?.items || []
                cost = callCost
                probedOk = true
                opts.budget?.recordCacheMiss()
                opts.budget?.recordSpend(callCost)
                await cacheSet(opts.instanceId, SERP_ENDPOINT, params, { keyword, cost, items }, cost)
            } catch (err) {
                errorMsg = (err as Error).message
            }
        }
        totalCost += cost

        if (!probedOk) {
            results.push({
                engine: 'google_aio',
                keyword,
                cited_us: false,
                citations: [],
                probed_successfully: false,
                error: errorMsg,
                cost_usd: cost,
                probed_at: new Date().toISOString(),
            })
            continue
        }

        // Find AIO item
        const aio = items.find(it => it.item_type === 'ai_overview')
        if (!aio) {
            // No AIO triggered for this keyword — that's a legit Google verdict
            results.push({
                engine: 'google_aio',
                keyword,
                cited_us: false,
                citations: [],
                probed_successfully: true,
                error: 'no_aio_for_query',
                cost_usd: cost,
                probed_at: new Date().toISOString(),
            })
            continue
        }

        const refs = Array.isArray(aio.references) ? aio.references : []
        const citations = refs.map(r => ({
            source: r.domain || extractDomain(r.url || '') || '?',
            url: r.url,
            rank: undefined,
        }))
        const cited_us = citations.some(c => isOurBrand(c, opts.ourIdentifiers))
        const answerText = (aio.items || [])
            .map(i => i.text || '')
            .filter(Boolean)
            .join(' ')
            .slice(0, 800)

        results.push({
            engine: 'google_aio',
            keyword,
            cited_us,
            citations,
            answer_excerpt: answerText,
            probed_successfully: true,
            cost_usd: cost,
            probed_at: new Date().toISOString(),
        })
    }

    return {
        engine: 'google_aio',
        keywords: kws,
        results,
        citation_share_pct: citationSharePct(results),
        total_cost_usd: totalCost,
        duration_ms: 0,  // set by caller
    }
}

function probeSkipped(keyword: string, reason: string): AeoProbeResult {
    return {
        engine: 'google_aio',
        keyword,
        cited_us: false,
        citations: [],
        probed_successfully: false,
        error: reason,
        cost_usd: 0,
        probed_at: new Date().toISOString(),
    }
}

function extractDomain(url: string): string | null {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return null
    }
}