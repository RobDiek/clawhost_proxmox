/**
 * DataForSEO AI Optimization API wrappers — the AEO / LLM-visibility layer.
 *
 * Three products (https://docs.dataforseo.com/v3/ai_optimization-overview/):
 *   1. LLM Mentions  — passive index of 200M+ AI answers. Per domain/keyword:
 *      citation count (URL linked) + mention count (brand named, no URL),
 *      grouped by engine / location / source. 2-7 day freshness lag. CHEAP.
 *      → the weekly AEO measurement baseline.
 *   2. LLM Responses — LIVE probe: send our JTBD prompt to ChatGPT / Claude /
 *      Gemini / Perplexity, get the answer + citation annotations. Per-call
 *      LLM cost (pricier). → monthly deep-probe.
 *   3. AI Keyword Data — search volume of conversational/AI queries.
 *
 * Billing: every call goes through dfsPost → per-tenant ledger debit at exact
 * DFS cost + monthly-cap pre-flight (see client.ts). Tracking-level opt-in +
 * cap is enforced one layer up by the tracking runner.
 *
 * NOTE: LLM Mentions request field names are applied per DFS docs; if a field
 * is rejected (40000) on first live call, adjust here — verified against the
 * live API during the Packing tracking run.
 */
import { dfsPost } from './client'
import { cacheGet, cacheSet } from './cache'
import { LOCATION_NAME_IL, LANGUAGE_HE, languageName } from './types'

export type LlmEngine = 'chat_gpt' | 'claude' | 'gemini' | 'perplexity'

/** Sensible base model per engine — DFS auto-selects the latest version from a
 *  base name. Override per call; fetch live options via {engine}/llm_responses/models. */
const DEFAULT_MODEL: Record<LlmEngine, string> = {
    chat_gpt: 'gpt-4o',
    claude: 'claude-sonnet-4-5',
    gemini: 'gemini-2.5-flash',
    perplexity: 'sonar',
}

interface LlmResponseResult {
    engine: LlmEngine
    model: string
    text: string
    citations: Array<{ title: string; url: string }>
    fanOutQueries: string[]
    moneySpent: number
}

/**
 * LIVE probe — ask one engine our prompt, return answer + citation annotations.
 * Endpoint: ai_optimization/{engine}/llm_responses/live
 */
export async function llmResponse(
    instanceId: string,
    engine: LlmEngine,
    userPrompt: string,
    opts: { model?: string; webSearch?: boolean; systemMessage?: string; maxOutputTokens?: number } = {},
): Promise<{ items: LlmResponseResult[]; cost: number; cached: boolean }> {
    const params: Record<string, unknown> = {
        user_prompt: userPrompt.slice(0, 500),   // DFS hard cap 500 chars
        model_name: opts.model ?? DEFAULT_MODEL[engine],
        web_search: opts.webSearch ?? true,       // AEO = grounded answers with citations
        max_output_tokens: opts.maxOutputTokens ?? 2048,
    }
    if (opts.systemMessage) params.system_message = opts.systemMessage.slice(0, 500)
    const endpoint = `ai_optimization/${engine}/llm_responses/live`

    const cached = await cacheGet<{ items: LlmResponseResult[]; cost: number }>(instanceId, endpoint, params)
    if (cached) return { items: cached.items, cost: 0, cached: true }

    const { result, cost } = await dfsPost<any>(instanceId, endpoint, [params])
    const items: LlmResponseResult[] = []
    for (const r of (result || [])) {
        const itemsArr = Array.isArray(r?.items) ? r.items : [r]
        for (const it of itemsArr) {
            if (!it) continue
            const annotations = Array.isArray(it.annotations) ? it.annotations : []
            items.push({
                engine,
                model: it.model_name || params.model_name as string,
                text: typeof it.message === 'string' ? it.message : (it.text || it.content || ''),
                citations: annotations.map((a: any) => ({ title: String(a?.title || ''), url: String(a?.url || '') })).filter((c: any) => c.url),
                fanOutQueries: Array.isArray(it.fan_out_queries) ? it.fan_out_queries.map((q: any) => String(q)) : [],
                moneySpent: Number(it.money_spent) || 0,
            })
        }
    }
    await cacheSet(instanceId, endpoint, params, { items, cost }, cost)
    return { items, cost, cached: false }
}

interface LlmMentionEntry {
    target: string                 // domain or brand queried
    citationCount: number          // AI linked the URL
    mentionCount: number           // AI named the brand, no URL
    aiSearchVolume?: number
    perEngine?: Record<string, { citations: number; mentions: number }>
    quotedLinks?: string[]
}

async function mentionsCall(
    instanceId: string,
    sub: 'search' | 'aggregated_metrics' | 'cross_aggregated_metrics' | 'top_domains' | 'top_pages',
    params: Record<string, unknown>,
): Promise<{ result: any[]; cost: number; cached: boolean }> {
    const endpoint = `ai_optimization/llm_mentions/${sub}/live`
    const cached = await cacheGet<{ result: any[]; cost: number }>(instanceId, endpoint, params)
    if (cached) return { result: cached.result, cost: 0, cached: true }
    const { result, cost } = await dfsPost<any>(instanceId, endpoint, [params])
    await cacheSet(instanceId, endpoint, params, { result, cost }, cost)
    return { result: result || [], cost, cached: false }
}

/**
 * Aggregated brand mention/citation metrics for our domain (+ optional keyword
 * scope), grouped by AI engine. The weekly AEO KPI.
 * Endpoint: ai_optimization/llm_mentions/aggregated_metrics/live
 */
export async function llmMentionsAggregated(
    instanceId: string,
    opts: { domains?: string[]; keywords?: string[]; locationName?: string; languageCode?: 'he' | 'en' },
): Promise<{ entries: LlmMentionEntry[]; cost: number; cached: boolean }> {
    const params: Record<string, unknown> = {
        location_name: opts.locationName ?? LOCATION_NAME_IL,
        language_name: languageName(opts.languageCode ?? LANGUAGE_HE),
    }
    if (opts.domains?.length) params.domains = opts.domains
    if (opts.keywords?.length) params.keywords = opts.keywords.slice(0, 200)
    const { result, cost, cached } = await mentionsCall(instanceId, 'aggregated_metrics', params)
    const entries: LlmMentionEntry[] = []
    for (const r of result) {
        const arr = Array.isArray(r?.items) ? r.items : [r]
        for (const it of arr) {
            if (!it) continue
            entries.push({
                target: String(it.target || it.domain || it.keyword || ''),
                citationCount: Number(it.citations_count ?? it.citation_count ?? it.citations) || 0,
                mentionCount: Number(it.mentions_count ?? it.mention_count ?? it.mentions) || 0,
                aiSearchVolume: it.ai_search_volume != null ? Number(it.ai_search_volume) : undefined,
                perEngine: it.ai_platforms || it.platforms || undefined,
            })
        }
    }
    return { entries, cost, cached }
}

/**
 * Top domains cited by AI for a keyword/topic — who owns the AI answer in our
 * space (us vs competitors). Endpoint: ai_optimization/llm_mentions/top_domains/live
 */
export async function llmMentionsTopDomains(
    instanceId: string,
    opts: { keywords?: string[]; domain?: string; locationName?: string; languageCode?: 'he' | 'en'; limit?: number },
): Promise<{ result: any[]; cost: number; cached: boolean }> {
    const params: Record<string, unknown> = {
        location_name: opts.locationName ?? LOCATION_NAME_IL,
        language_name: languageName(opts.languageCode ?? LANGUAGE_HE),
        limit: opts.limit ?? 50,
    }
    if (opts.keywords?.length) params.keywords = opts.keywords.slice(0, 200)
    if (opts.domain) params.target = opts.domain
    return mentionsCall(instanceId, 'top_domains', params)
}

/**
 * AI search volume for conversational queries.
 * Endpoint: ai_optimization/ai_keyword_data/keywords_search_volume/live
 */
export async function aiKeywordSearchVolume(
    instanceId: string,
    keywords: string[],
    opts: { locationName?: string; languageCode?: 'he' | 'en' } = {},
): Promise<{ items: any[]; cost: number; cached: boolean }> {
    const endpoint = 'ai_optimization/ai_keyword_data/keywords_search_volume/live'
    const params = {
        keywords: keywords.slice(0, 1000),
        location_name: opts.locationName ?? LOCATION_NAME_IL,
        language_name: languageName(opts.languageCode ?? LANGUAGE_HE),
    }
    const cached = await cacheGet<{ items: any[]; cost: number }>(instanceId, endpoint, params)
    if (cached) return { items: cached.items, cost: 0, cached: true }
    const { result, cost } = await dfsPost<any>(instanceId, endpoint, [params])
    const items = Array.isArray(result?.[0]?.items) ? result[0].items : (Array.isArray(result) ? result : [])
    await cacheSet(instanceId, endpoint, params, { items, cost }, cost)
    return { items, cost, cached: false }
}