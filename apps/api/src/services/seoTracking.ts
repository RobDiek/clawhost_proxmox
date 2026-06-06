/**
 * SEO + AEO recurring tracking — per-tenant state, config, scope, time-series.
 *
 * Lives in `mateh_agents.researchData.seoTracking` (always via mutateResearchData
 * per the dual-write contract). Distinct from `researchData.seoMonitoring` (the
 * free GSC/HC/home-grown-AEO digest): seoTracking is the PAID, opt-in DataForSEO
 * layer (ranks/traffic/keyword-gap/AI-mentions/AI-responses) with a per-tenant
 * monthly cap + spend ledger. Reports read from BOTH.
 *
 * Time-series are rolling windows (cap MAX_SERIES entries) so researchData stays
 * bounded. Weekly cadence → ~2 years of history per series.
 */
import type { TrackingConfig } from '@/services/research/dataforseo/costEstimator'
import type { MatehAgentRow } from '@/services/agentContext'
import { mutateResearchData } from '@/services/agentContext'

const MAX_SERIES = 110   // ~2 years of weekly points

export interface SeoTrackingConfig extends TrackingConfig {
    enabled: boolean
    monthlyCapUsdCents: number | null   // tracking-specific cap (separate from global DFS cap)
    optedInAt?: string
}

export interface SeoTrackingScope {
    domain: string
    keywords: string[]        // target keywords for per-keyword SERP tracking
    competitors: string[]     // competitor domains for keyword-gap
    llmPrompts: string[]      // JTBD prompts for the monthly LLM-responses probe
}

export interface RankPoint { date: string; etv?: number; pos_1_3?: number; pos_4_10?: number; pos_11_100?: number; keywordsCount?: number }
export interface KeywordPosPoint { date: string; byKeyword: Record<string, number | null> }
export interface TrafficPoint { date: string; etv?: number }
export interface AiMentionPoint { date: string; totalCitations: number; totalMentions: number; aiSearchVolume?: number; perEngine?: Record<string, { citations: number; mentions: number }> }
export interface AiResponsePoint { date: string; perEngine: Record<string, { brandCited: number; competitorsCited: number; prompts: number }> }

export interface SeoTrackingState {
    config: SeoTrackingConfig
    scope: SeoTrackingScope
    series: {
        ranks: RankPoint[]
        keywordPositions: KeywordPosPoint[]
        traffic: TrafficPoint[]
        aiMentions: AiMentionPoint[]
        aiResponses: AiResponsePoint[]
    }
    spend: { byMonth: Record<string, number>; lastWeeklyRun?: string; lastMonthlyRun?: string }
    status: 'active' | 'paused_cap' | 'paused_balance' | 'disabled'
    statusReason?: string
}

export function defaultSeoTrackingState(): SeoTrackingState {
    return {
        config: {
            enabled: false, monthlyCapUsdCents: null,
            rankTracking: false, perKeywordSerp: false, trafficTracking: false,
            keywordGap: false, aiKeywordData: false, llmMentions: false, llmResponses: false,
            engines: [],
        },
        scope: { domain: '', keywords: [], competitors: [], llmPrompts: [] },
        series: { ranks: [], keywordPositions: [], traffic: [], aiMentions: [], aiResponses: [] },
        spend: { byMonth: {} },
        status: 'disabled',
    }
}

export function readSeoTracking(agent: MatehAgentRow): SeoTrackingState {
    const rd: any = agent.researchData || {}
    const s = rd.seoTracking
    if (!s) return defaultSeoTrackingState()
    const d = defaultSeoTrackingState()
    return {
        config: { ...d.config, ...(s.config || {}) },
        scope: { ...d.scope, ...(s.scope || {}) },
        series: { ...d.series, ...(s.series || {}) },
        spend: { ...d.spend, ...(s.spend || {}) },
        status: s.status || (s.config?.enabled ? 'active' : 'disabled'),
        statusReason: s.statusReason,
    }
}

/** Mutate the seoTracking sub-tree safely (read-modify-write via mutateResearchData). */
export async function updateSeoTracking(
    agent: MatehAgentRow, instanceId: string,
    fn: (s: SeoTrackingState) => SeoTrackingState,
): Promise<void> {
    await mutateResearchData(agent, instanceId, (rd: any) => {
        const current: SeoTrackingState = rd.seoTracking
            ? readSeoTracking({ ...agent, researchData: rd } as MatehAgentRow)
            : defaultSeoTrackingState()
        rd.seoTracking = fn(current)
        return rd
    })
}

export function monthKey(iso: string): string { return iso.slice(0, 7) }   // 'YYYY-MM'

export function monthSpendUsd(state: SeoTrackingState, yyyymm: string): number {
    return (state.spend.byMonth[yyyymm] || 0)
}

/** Append a point to a rolling series (trims to MAX_SERIES). Pure — returns new state. */
export function withSeriesPoint<K extends keyof SeoTrackingState['series']>(
    state: SeoTrackingState, key: K, point: SeoTrackingState['series'][K][number],
): SeoTrackingState {
    const arr = [...(state.series[key] as any[]), point].slice(-MAX_SERIES)
    return { ...state, series: { ...state.series, [key]: arr } }
}

/** Add spend (USD) to the month bucket. Pure. */
export function withSpend(state: SeoTrackingState, isoDate: string, usd: number): SeoTrackingState {
    const mk = monthKey(isoDate)
    return { ...state, spend: { ...state.spend, byMonth: { ...state.spend.byMonth, [mk]: (state.spend.byMonth[mk] || 0) + usd } } }
}

/**
 * Derive the tracking scope from the tenant's research/strategy data:
 *   - domain   ← website URL
 *   - keywords ← prioritized target keywords from seo_keyword_research
 *   - competitors ← identified competitor domains
 *   - llmPrompts  ← JTBD prompts (reuse AEO probe prompts if present)
 * Bounded (topN keywords) to keep per-keyword SERP cost predictable.
 */
export function deriveScope(agent: MatehAgentRow, opts: { maxKeywords?: number } = {}): SeoTrackingScope {
    const rd: any = agent.researchData || {}
    const results = rd.results || {}
    const maxKw = opts.maxKeywords ?? 40

    const rawDomain = rd.answers?.websiteUrl || rd.answers?.website || rd.websiteUrl || ''
    const domain = String(rawDomain).replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()

    // target keywords — the canonical store is seo_keyword_research.records[]
    // (each a keyword row with is_priority). Fall back to dfsData.rankedKeywords
    // and the legacy curated-set shapes.
    const kr = results.seo_keyword_research || {}
    const kwOf = (r: any): string => (typeof r === 'string' ? r : (r?.keyword || r?.term || r?.query || r?.kw || '')).trim()
    let kwRows: any[] = []
    if (Array.isArray(kr.records) && kr.records.length) kwRows = kr.records
    else if (Array.isArray(kr.dfsData?.rankedKeywords)) kwRows = kr.dfsData.rankedKeywords
    else kwRows = [kr.targetKeywords, kr.prioritizedKeywords, kr.primaryKeywords, kr.keywords].find(Array.isArray) || []
    // priority keywords first
    const prioritized = [...kwRows].sort((a, b) => (b?.is_priority ? 1 : 0) - (a?.is_priority ? 1 : 0))
    const keywords = Array.from(new Set(prioritized.map(kwOf).filter(Boolean))).slice(0, maxKw)

    // competitors — competitor_landscape.records[] ({url,name,bucket}) +
    // user-declared answers.competitors. Prefer direct competitors.
    const cl = results.competitor_landscape || {}
    const compRows: any[] = Array.isArray(cl.records) ? cl.records
        : (Array.isArray(cl.dfsData?.competitors) ? cl.dfsData.competitors : [])
    const toDomain = (s: any): string => String(s || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim()
    const direct = compRows.filter(r => !r?.bucket || r.bucket === 'direct')
    const compSorted = direct.length ? direct : compRows
    const comps = compSorted.map(r => toDomain(typeof r === 'string' ? r : (r?.url || r?.domain || r?.website || r?.name)))
    const userComps = (Array.isArray(rd.answers?.competitors) ? rd.answers.competitors : []).map((c: any) => toDomain(typeof c === 'string' ? c : (c?.url || c?.domain || c?.name)))
    const competitors = Array.from(new Set([...comps, ...userComps].filter(Boolean).filter(d => d && d !== domain))).slice(0, 5)

    // JTBD prompts for the AI-responses probe — reuse stored AEO prompts, else
    // derive from the top priority keywords (the AI-visibility queries we care about).
    let llmPrompts: string[] = rd.aeoPrompts || rd.seoMonitoring?.aeoProbes?.prompts || []
    if (!Array.isArray(llmPrompts) || !llmPrompts.length) llmPrompts = keywords.slice(0, 12)
    else llmPrompts = llmPrompts.slice(0, 20)

    return { domain, keywords, competitors, llmPrompts }
}