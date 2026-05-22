/**
 * AEO/GEO probing layer — measure brand citation share across answer engines.
 *
 * Implemented engines (Phase 2026.01):
 *   - google_aio: Google AI Overview, via DFS SERP advanced endpoint
 *     (cheap — uses cached SERP data, no new external dependency)
 *   - claude: Anthropic Claude with web-search tool (via existing
 *     anthropic SDK — leverages the master key already in env)
 *
 * Deferred (Phase 2026.02):
 *   - chatgpt: OpenAI ChatGPT API with browsing (needs OPENAI_API_KEY)
 *   - perplexity: Perplexity API + citation extraction (needs PERPLEXITY_API_KEY)
 *   - bing_copilot: via Bing Webmaster Tools (needs Bing setup per tenant)
 *
 * Output: structured probing result per (engine, keyword) — did the
 * engine cite our brand? Did it cite competitors? What was the
 * surrounding context?
 *
 * Cost guard: bounded by RunBudget — caller declares max probes per run.
 */

import type { RunBudget } from '../dataforseo/runBudget'

export type AeoEngine = 'google_aio' | 'claude' | 'chatgpt' | 'perplexity' | 'bing_copilot'

export interface AeoProbeResult {
    engine: AeoEngine
    keyword: string
    /** Was OUR brand/domain cited in the answer? */
    cited_us: boolean
    /** Domains/brands cited by this engine for this keyword */
    citations: Array<{ source: string; url?: string; rank?: number }>
    /** Generated answer text (may be truncated for storage efficiency) */
    answer_excerpt?: string
    /** Did the probe succeed? false = engine not reachable / data unavailable */
    probed_successfully: boolean
    error?: string
    /** Cost of this probe in USD (0 for cached/free engines) */
    cost_usd: number
    probed_at: string  // ISO timestamp
}

export interface AeoProbeBatchResult {
    engine: AeoEngine
    keywords: string[]
    results: AeoProbeResult[]
    citation_share_pct: number   // % of probes where our brand was cited
    total_cost_usd: number
    duration_ms: number
}

export interface AeoProbeOpts {
    instanceId: string
    ourDomain: string
    /** Brand identifier strings to consider as "us" — domain variations + brand names */
    ourIdentifiers: string[]
    keywords: string[]
    engines: AeoEngine[]
    /** Optional RunBudget for cost capping */
    budget?: RunBudget
    /** Per-engine call limit (defaults to keywords.length) */
    maxProbesPerEngine?: number
}

/**
 * Run AEO probes across requested engines for a list of priority keywords.
 *
 * Per-engine failures are isolated — one engine's outage doesn't block the
 * others. Returns one BatchResult per requested engine.
 */
export async function probeBrandVisibility(opts: AeoProbeOpts): Promise<AeoProbeBatchResult[]> {
    const results: AeoProbeBatchResult[] = []
    for (const engine of opts.engines) {
        const start = Date.now()
        try {
            const batch = await probeOneEngine(engine, opts)
            batch.duration_ms = Date.now() - start
            results.push(batch)
        } catch (err) {
            console.warn(`[aeoProbing] engine ${engine} top-level failed: ${(err as Error).message}`)
            results.push({
                engine,
                keywords: opts.keywords,
                results: opts.keywords.map(k => ({
                    engine,
                    keyword: k,
                    cited_us: false,
                    citations: [],
                    probed_successfully: false,
                    error: (err as Error).message,
                    cost_usd: 0,
                    probed_at: new Date().toISOString(),
                })),
                citation_share_pct: 0,
                total_cost_usd: 0,
                duration_ms: Date.now() - start,
            })
        }
    }
    return results
}

async function probeOneEngine(engine: AeoEngine, opts: AeoProbeOpts): Promise<AeoProbeBatchResult> {
    switch (engine) {
        case 'google_aio': {
            const { probeGoogleAio } = await import('./google_aio')
            return probeGoogleAio(opts)
        }
        case 'claude': {
            const { probeClaude } = await import('./claude')
            return probeClaude(opts)
        }
        case 'chatgpt':
        case 'perplexity':
        case 'bing_copilot':
            // Deferred to Phase 2026.02 — return empty batch with diagnostic
            return {
                engine,
                keywords: opts.keywords,
                results: opts.keywords.map(k => ({
                    engine,
                    keyword: k,
                    cited_us: false,
                    citations: [],
                    probed_successfully: false,
                    error: 'engine_not_implemented',
                    cost_usd: 0,
                    probed_at: new Date().toISOString(),
                })),
                citation_share_pct: 0,
                total_cost_usd: 0,
                duration_ms: 0,
            }
    }
}

/**
 * Helper: check if any of our identifiers appears in the cited sources.
 */
export function isOurBrand(citation: { source: string; url?: string }, ourIdentifiers: string[]): boolean {
    const haystack = `${citation.source} ${citation.url || ''}`.toLowerCase()
    return ourIdentifiers.some(id => {
        const needle = id.toLowerCase()
        return needle.length >= 3 && haystack.includes(needle)
    })
}

/**
 * Compute citation share — % of probes where our brand was cited.
 */
export function citationSharePct(results: AeoProbeResult[]): number {
    if (results.length === 0) return 0
    const okProbes = results.filter(r => r.probed_successfully)
    if (okProbes.length === 0) return 0
    const citedCount = okProbes.filter(r => r.cited_us).length
    return Math.round((citedCount / okProbes.length) * 100)
}