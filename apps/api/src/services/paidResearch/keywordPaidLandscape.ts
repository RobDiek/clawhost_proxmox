/**
 * Paid-track keyword landscape research.
 *
 * Mirror of the organic seo_keyword_research, but tuned for paid:
 *   - Source pool: keywords competitors RANK for (organic SERP) + keywords
 *     they BID on (semantic expansion + SERP ad-density)
 *   - Per keyword: CPC range (low/high top-of-page bid), competition_index,
 *     monthly volume, intent classification (TOFU/MOFU/BOFU)
 *   - SERP ad-density: how many ads on the SERP for the keyword — proxy for
 *     auction competition (>3 ads = heavy auction)
 *   - IL-specific: location_code=2376 (Israel), language_code=iw for Google
 *     Ads endpoint, he for Labs endpoints
 *
 * Cost: 1 keywordIdeas call (seed expansion) + 1 searchVolume bulk call
 * (per-keyword CPC + volume) + per-competitor rankedKeywords (top 30).
 * Total ~$2-5 per audit depending on competitor count.
 *
 * Output shape designed for direct embedding in Opus prompt — keyword list
 * with everything needed for tier classification + bid recommendation.
 */

import {
    keywordIdeas,
    searchVolume,
    rankedKeywords,
    LOCATION_IL,
    DfsError,
    type KeywordIdeasItem,
    type SearchVolumeItem,
    type RankedKeywordItem,
} from '@/services/research/dataforseo'

/** Funnel stage we classify each keyword into. */
export type IntentTier = 'TOFU' | 'MOFU' | 'BOFU' | 'BRAND' | 'UNKNOWN'

export interface PaidKeyword {
    keyword: string
    /** Monthly search volume (IL). */
    searchVolume: number
    /** Cost per click — Google Ads-native estimate (₪ if IL-localized). */
    cpc: number | null
    /** Low end of top-of-page bid range (CPC ±20%). */
    lowTopOfPageBid: number | null
    /** High end of top-of-page bid range. */
    highTopOfPageBid: number | null
    /** Auction competition bucket from Google Ads. */
    competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
    /** 0-100 numeric competition. >70 = heavy auction. */
    competitionIndex: number | null
    /** Keyword Difficulty score (organic ranking difficulty 0-100). */
    keywordDifficulty: number | null
    /** Funnel-stage classification — drives bid strategy + ad copy angle. */
    intentTier: IntentTier
    /** Why we tagged this intent — for transparency. */
    intentRationale: string
    /** Which competitors RANK for this keyword (organic top 10). Signal that paid auction will be contested. */
    rankedCompetitors: string[]
    /** Whether the user's brand name appears in the keyword (brand vs non-brand). */
    isBrandKeyword: boolean
    /** Suggested daily budget contribution (estimated clicks × CPC × confidence). */
    estimatedDailyBudgetIls: number | null
}

export interface PaidKeywordLandscape {
    available: boolean
    reason?: string
    /** Source provenance — which DFS endpoints we hit, cache stats. */
    diagnostics: {
        callsAttempted: number
        callsFailed: number
        cacheHits: number
        cacheMisses: number
        totalCostUsd: number
        keywordsSeed: number
        keywordsAfterExpansion: number
        keywordsAfterVolumeFilter: number
        /** Phase 4.2.1-G — keywords dropped because they contained blocklist tokens. */
        keywordsDroppedByBlocklist?: number
        latencyMs: number
    }
    /** Phase 4.2.1-H — SQR top-converters propagated through for prompt builder. */
    sqrTopConverters?: Array<{ searchTerm: string; conversions: number; cpa: number; clicks: number }>
    /** Per-keyword paid-track data. Sorted by estimated value (volume × CVR proxy). */
    keywords: PaidKeyword[]
    /** Clusters (semantic groups) extracted from keyword data. Opus uses these for ad-group bucketing. */
    clusters: Array<{
        clusterId: string
        label: string                  // e.g. "מחיר אחסון" or "סטוראג' נתניה"
        keywords: string[]
        avgCpc: number | null
        totalMonthlyVolume: number
        dominantIntent: IntentTier
    }>
    /** Cross-keyword IL CPC benchmarks (sanity-check upper-bound on bids). */
    ilBenchmarks: {
        medianCpcIls: number | null
        p25CpcIls: number | null
        p75CpcIls: number | null
        highestVolumeKeyword?: string
        cheapestKeywordWithVolume?: string
    }
    /** Intent distribution — Opus uses to balance ad group structure. */
    intentDistribution: Record<IntentTier, number>
}

// ─── IL transactional/commercial intent signals (Hebrew + English) ────────
// Phase 4.2(fix) — expanded Hebrew BOFU lexicon. Previous version missed
// core IL transactional signals like "להשכרה" (for rent), "למכירה" (for sale),
// "כמה עולה" (how much), "מבצע" (deal) — resulting in 98% UNKNOWN intent
// classification on a real IL storage rental dataset. Now covers:
//   - rental/sale verb forms (the #1 IL paid-search signal)
//   - price/cost queries
//   - location proximity ("near me" Hebrew variants)
//   - urgency / availability
//   - direct-contact terms (phone, WhatsApp, message)
//   - deal / discount / coupon
// MOFU adds product-comparison + experiential queries.
// TOFU adds Hebrew educational variants.

const BOFU_HE = new RegExp([
    // Rental / sale verbs (most common IL paid signal)
    'להשכרה', 'להשכיר', 'השכרת', 'שכירות', 'משכירים',
    'למכירה', 'למכור', 'מכירת', 'קנייה', 'קניית', 'לקנות',
    // Price / cost (clear transactional)
    'מחיר', 'מחירים', 'עלות', 'כמה עולה', 'כמה זה עולה', 'כמה זה',
    // Order / booking
    'להזמין', 'הזמנה', 'הזמנת', 'הצעת מחיר', 'הצעה',
    // Direct contact
    'לפנות', 'יצירת קשר', 'מספר טלפון', 'וואטסאפ', 'ווצאפ', 'הודעה',
    // Local proximity
    'באזור', 'בעיר', 'קרוב', 'בקרבת', 'בסביבה', 'ליד', 'אצלנו', 'אצלי',
    // Urgency / availability
    'דחוף', 'עכשיו', 'מיידי', 'היום', 'זמין', 'פנוי',
    // Deals
    'מבצע', 'מבצעים', 'הנחה', 'הנחות', 'הכי זול', 'זול',
].join('|'), 'u')

const BOFU_EN = /\b(buy|buying|purchase|rent|rental|renting|for rent|for sale|price|prices|cost|costs|how much|order|book|booking|quote|contact|phone|whatsapp|near me|today|now|deal|cheap|cheapest|discount)\b/i

const MOFU_HE = new RegExp([
    'השוואה', 'השוואת', 'לעומת', 'מול',
    'הכי טוב', 'הטוב ביותר', 'מהטובים', 'מומלץ', 'מומלצים',
    'מה ההבדל', 'איזה', 'איזה עדיף', 'יתרונות', 'חסרונות',
    'דירוג', 'מדורג', 'חוות דעת', 'ביקורות', 'ביקורת',
    'איפה', 'איפה עדיף', 'איפה הכי',  // "where is best" — comparison intent
].join('|'), 'u')

const MOFU_EN = /\b(vs|comparison|review|reviews|best|top \d|recommended|alternative|alternatives|pros and cons|where to|which|better)\b/i

const TOFU_HE = new RegExp([
    'איך', 'איך עושים', 'איך מבצעים', 'איך לבחור',
    'מה זה', 'מה זאת', 'מהו', 'מהי',
    'למה', 'מדוע',
    'מדריך', 'מדריכים', 'הסבר', 'הסברים', 'טיפים', 'טיפ',
    'יסודות', 'מבוא',
].join('|'), 'u')

const TOFU_EN = /\b(how to|how do|what is|what are|guide|guides|tips|why|tutorial|learn|learning|introduction|basics|fundamentals)\b/i

function classifyIntent(kw: string, dfsIntent?: string, isBrand?: boolean): { tier: IntentTier; rationale: string } {
    const k = kw.toLowerCase()
    if (isBrand) return { tier: 'BRAND', rationale: 'contains brand name' }
    // Strongest signal: explicit BOFU lexicon (transactional)
    if (BOFU_HE.test(kw) || BOFU_EN.test(k)) return { tier: 'BOFU', rationale: 'transactional/commercial lexicon present' }
    // MOFU: comparison/research
    if (MOFU_HE.test(kw) || MOFU_EN.test(k)) return { tier: 'MOFU', rationale: 'comparison/research lexicon present' }
    // TOFU: educational
    if (TOFU_HE.test(kw) || TOFU_EN.test(k)) return { tier: 'TOFU', rationale: 'educational/informational lexicon present' }
    // Secondary: DFS-classified intent
    if (dfsIntent === 'transactional') return { tier: 'BOFU', rationale: 'DFS-classified transactional' }
    if (dfsIntent === 'commercial')    return { tier: 'MOFU', rationale: 'DFS-classified commercial' }
    if (dfsIntent === 'informational') return { tier: 'TOFU', rationale: 'DFS-classified informational' }
    if (dfsIntent === 'navigational')  return { tier: 'BRAND', rationale: 'DFS-classified navigational' }
    return { tier: 'UNKNOWN', rationale: 'no clear lexical or DFS signal' }
}

// ─── Cluster keywords by shared root-tokens (cheap heuristic, no LLM) ─────
function clusterKeywords(keywords: PaidKeyword[]): PaidKeywordLandscape['clusters'] {
    // Hebrew + English root tokenizer: strip prefixes ב/ל/מ/ש/ה/ו from Hebrew words
    // then group by 2+ shared significant tokens.
    const STOP_HE = new Set(['של', 'את', 'על', 'אם', 'או', 'עם', 'גם', 'אבל', 'יש'])
    const STOP_EN = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'and', 'or', 'for'])

    function tokenize(k: string): string[] {
        return k.toLowerCase()
            .replace(/[^֐-׿a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length >= 3 && !STOP_HE.has(t) && !STOP_EN.has(t))
            .map(t => t.replace(/^[בלמשהו]/u, ''))   // strip Hebrew prefixes
            .filter(t => t.length >= 2)
    }

    const tokensPerKw = new Map<string, Set<string>>()
    for (const kw of keywords) {
        tokensPerKw.set(kw.keyword, new Set(tokenize(kw.keyword)))
    }

    // Group: find keyword pairs with ≥2 shared tokens
    const visited = new Set<string>()
    const clusters: PaidKeywordLandscape['clusters'] = []
    let cid = 0
    for (const kw of keywords) {
        if (visited.has(kw.keyword)) continue
        const tokens = tokensPerKw.get(kw.keyword)!
        if (tokens.size === 0) continue
        const cluster: string[] = [kw.keyword]
        visited.add(kw.keyword)
        for (const other of keywords) {
            if (visited.has(other.keyword)) continue
            const otherTokens = tokensPerKw.get(other.keyword)!
            let shared = 0
            for (const t of tokens) if (otherTokens.has(t)) shared++
            if (shared >= 2) {
                cluster.push(other.keyword)
                visited.add(other.keyword)
            }
        }
        if (cluster.length >= 2) {
            const clusterKwObjs = keywords.filter(k => cluster.includes(k.keyword))
            const cpcs = clusterKwObjs.map(k => k.cpc).filter((c): c is number => c !== null)
            const avgCpc = cpcs.length ? cpcs.reduce((s, c) => s + c, 0) / cpcs.length : null
            const totalVol = clusterKwObjs.reduce((s, k) => s + k.searchVolume, 0)
            const intentCount: Record<IntentTier, number> = { TOFU: 0, MOFU: 0, BOFU: 0, BRAND: 0, UNKNOWN: 0 }
            for (const k of clusterKwObjs) intentCount[k.intentTier]++
            const dominantIntent = (Object.entries(intentCount).sort((a, b) => b[1] - a[1])[0][0]) as IntentTier
            // Label = first 2 most-common tokens across the cluster
            const tokenCount = new Map<string, number>()
            for (const k of clusterKwObjs) {
                for (const t of tokensPerKw.get(k.keyword) || []) {
                    tokenCount.set(t, (tokenCount.get(t) || 0) + 1)
                }
            }
            const label = [...tokenCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]).join(' ')
            clusters.push({
                clusterId: `c${cid++}`,
                label: label || `cluster_${cid}`,
                keywords: cluster,
                avgCpc,
                totalMonthlyVolume: totalVol,
                dominantIntent,
            })
        }
    }
    return clusters.sort((a, b) => b.totalMonthlyVolume - a.totalMonthlyVolume)
}

// ─── IL benchmark stats over fetched keyword pool ─────────────────────────
function computeIlBenchmarks(keywords: PaidKeyword[]): PaidKeywordLandscape['ilBenchmarks'] {
    const cpcs = keywords.map(k => k.cpc).filter((c): c is number => c !== null && c > 0).sort((a, b) => a - b)
    if (cpcs.length === 0) {
        return { medianCpcIls: null, p25CpcIls: null, p75CpcIls: null }
    }
    const median = cpcs[Math.floor(cpcs.length * 0.5)]
    const p25 = cpcs[Math.floor(cpcs.length * 0.25)]
    const p75 = cpcs[Math.floor(cpcs.length * 0.75)]
    const sortedByVolume = [...keywords].sort((a, b) => b.searchVolume - a.searchVolume)
    const highestVolume = sortedByVolume[0]?.keyword
    const cheapWithVol = [...keywords]
        .filter(k => k.searchVolume >= 100 && k.cpc !== null)
        .sort((a, b) => (a.cpc || Infinity) - (b.cpc || Infinity))[0]
    return {
        medianCpcIls: median,
        p25CpcIls: p25,
        p75CpcIls: p75,
        highestVolumeKeyword: highestVolume,
        cheapestKeywordWithVolume: cheapWithVol?.keyword,
    }
}

// ─── Public entry ─────────────────────────────────────────────────────────

export interface FetchOpts {
    instanceId: string
    /** Seed keywords from user (answers.targetKeywords + answers.products names). */
    seedKeywords: string[]
    /** Competitor domains (from paid_competitor_landscape). Used to pull rankedKeywords for organic-paid bridge. */
    competitorDomains: string[]
    /** Brand name to detect brand-keyword overlap. */
    brandName: string
    /** Max keywords to keep in final landscape (cost control). */
    maxKeywords?: number
    /**
     * Phase 4.2.1-G — keywords to REJECT in DataForSEO expansion. Combines
     * SQR-derived n-gram waste patterns (from client_account_baseline) +
     * a default IL out-of-vertical stoplist. Anything containing these tokens
     * is dropped during keyword filtering, never reaching the prompt.
     */
    accountLevelNegatives?: string[]
    /**
     * Phase 4.2.1-H — SQR top-converting terms surfaced separately so the
     * prompt builder can mark them as Tier-1 (forced ad groups).
     */
    sqrTopConverters?: Array<{ searchTerm: string; conversions: number; cpa: number; clicks: number }>
}

export async function fetchPaidKeywordLandscape(opts: FetchOpts): Promise<PaidKeywordLandscape> {
    const startedAt = Date.now()
    const diagnostics: PaidKeywordLandscape['diagnostics'] = {
        callsAttempted: 0, callsFailed: 0,
        cacheHits: 0, cacheMisses: 0, totalCostUsd: 0,
        keywordsSeed: opts.seedKeywords.length,
        keywordsAfterExpansion: 0,
        keywordsAfterVolumeFilter: 0,
        latencyMs: 0,
    }

    if (opts.seedKeywords.length === 0 && opts.competitorDomains.length === 0) {
        return {
            available: false,
            reason: 'No seed keywords or competitor domains provided',
            diagnostics, keywords: [], clusters: [],
            ilBenchmarks: { medianCpcIls: null, p25CpcIls: null, p75CpcIls: null },
            intentDistribution: { TOFU: 0, MOFU: 0, BOFU: 0, BRAND: 0, UNKNOWN: 0 },
        }
    }

    const maxKw = opts.maxKeywords ?? 80
    // Google Ads / DataForSEO keyword limit: ≤80 chars, ≤10 words. A single
    // over-long "keyword" (e.g. a business description that leaked into the
    // seeds) makes the ENTIRE searchVolume call fail with 40501 → no data at
    // all. Filter every keyword that reaches a DFS call.
    const isValidKw = (k: string): boolean => {
        const t = (k || '').trim()
        return t.length >= 2 && t.length <= 80 && t.split(/\s+/).length <= 10
    }
    const allCandidates = new Set<string>(opts.seedKeywords.map(s => s.trim().toLowerCase()).filter(isValidKw))

    // 1. Pull competitor rankedKeywords (top 30 per competitor — their paid-relevant
    //    organic landscape; if they rank for it organically, they likely bid for it too).
    for (const domain of opts.competitorDomains.slice(0, 5)) {
        diagnostics.callsAttempted++
        try {
            const r = await rankedKeywords(opts.instanceId, domain, { language_code: 'he', location_code: LOCATION_IL, limit: 30 })
            diagnostics.cacheHits += r.cached ? 1 : 0
            diagnostics.cacheMisses += r.cached ? 0 : 1
            diagnostics.totalCostUsd += r.cost || 0
            for (const item of (r.items as RankedKeywordItem[])) {
                const kw = (item as { keyword?: string }).keyword
                if (kw && typeof kw === 'string' && kw.length >= 3) {
                    allCandidates.add(kw.trim().toLowerCase())
                }
            }
        } catch (err) {
            diagnostics.callsFailed++
            if (err instanceof DfsError) {
                console.warn(`[paidKeyword] rankedKeywords ${domain} failed:`, err.message)
            }
        }
    }

    // 2. Seed expansion — keywordIdeas on the 5 strongest seeds (best coverage / cost balance)
    const topSeeds = opts.seedKeywords.filter(s => isValidKw(s) && s.trim().length >= 3).slice(0, 5)
    if (topSeeds.length > 0) {
        diagnostics.callsAttempted++
        try {
            const r = await keywordIdeas(opts.instanceId, topSeeds, { location_code: LOCATION_IL, limit: 100 })
            diagnostics.cacheHits += r.cached ? 1 : 0
            diagnostics.cacheMisses += r.cached ? 0 : 1
            diagnostics.totalCostUsd += r.cost || 0
            for (const item of (r.items as KeywordIdeasItem[])) {
                if (item.keyword && typeof item.keyword === 'string') {
                    allCandidates.add(item.keyword.trim().toLowerCase())
                }
            }
        } catch (err) {
            diagnostics.callsFailed++
            console.warn(`[paidKeyword] keywordIdeas failed:`, (err as Error).message)
        }
    }
    diagnostics.keywordsAfterExpansion = allCandidates.size

    if (allCandidates.size === 0) {
        diagnostics.latencyMs = Date.now() - startedAt
        return {
            available: false,
            reason: 'No keywords resolved from seed + competitor expansion',
            diagnostics, keywords: [], clusters: [],
            ilBenchmarks: { medianCpcIls: null, p25CpcIls: null, p75CpcIls: null },
            intentDistribution: { TOFU: 0, MOFU: 0, BOFU: 0, BRAND: 0, UNKNOWN: 0 },
        }
    }

    // 3. Cap to top N candidates + bulk searchVolume call (gets CPC + competition)
    const candidates = Array.from(allCandidates).filter(isValidKw).slice(0, Math.min(maxKw * 1.5, 200))
    diagnostics.callsAttempted++
    let volumeItems: SearchVolumeItem[] = []
    try {
        const r = await searchVolume(opts.instanceId, candidates, { language_code: 'he', location_code: LOCATION_IL })
        diagnostics.cacheHits += r.cached ? 1 : 0
        diagnostics.cacheMisses += r.cached ? 0 : 1
        diagnostics.totalCostUsd += r.cost || 0
        volumeItems = r.items as SearchVolumeItem[]
    } catch (err) {
        diagnostics.callsFailed++
        diagnostics.latencyMs = Date.now() - startedAt
        return {
            available: false,
            reason: `DataForSEO searchVolume failed: ${(err as Error).message}`,
            diagnostics, keywords: [], clusters: [],
            ilBenchmarks: { medianCpcIls: null, p25CpcIls: null, p75CpcIls: null },
            intentDistribution: { TOFU: 0, MOFU: 0, BOFU: 0, BRAND: 0, UNKNOWN: 0 },
        }
    }

    // Phase 4.2.1-G — out-of-vertical blocklist. Tokens that should NEVER appear
    // in IL paid keywords for our verticals: apartment rentals, ויקיפדיה,
    // generic info searches, and SQR-derived waste patterns from baseline.
    // Default list catches the most common DFS-expansion contamination.
    const DEFAULT_BLOCKLIST_TOKENS = [
        'דירה', 'דירות', 'יד 2', 'יד2',           // apartment rental contamination
        'חדר', 'חדרים', 'בית', 'וילה',             // residential lookups
        'רכב', 'מכונית',                            // car-related leak
        'ויקיפדיה', 'wikipedia',                    // info-seekers
        'cloud', 'אחסון ענן', 'אחסון נתונים',      // wrong-vertical "storage"
        'google drive', 'dropbox', 'hosting',
        'אחסון אתרים', 'אחסון מזון', 'אחסון יין',
        'מעונות',                                   // dorms (different product)
        'משרות', 'משרה', 'עבודה', 'דרושים',         // job-seekers
    ]
    const blocklistTokens = new Set<string>(DEFAULT_BLOCKLIST_TOKENS.map(t => t.toLowerCase()))
    for (const pat of (opts.accountLevelNegatives || [])) {
        if (typeof pat === 'string' && pat.trim().length >= 2) {
            blocklistTokens.add(pat.trim().toLowerCase())
        }
    }

    // 4. Filter to keywords with REAL volume (≥10/month), drop blocklisted, shape PaidKeyword records
    const brandLower = opts.brandName.toLowerCase()
    let droppedByBlocklist = 0
    const paidKeywords: PaidKeyword[] = volumeItems
        .filter(v => (v.search_volume || 0) >= 10)
        .filter(v => {
            const kwLower = v.keyword.toLowerCase()
            for (const tok of blocklistTokens) {
                if (kwLower.includes(tok)) { droppedByBlocklist++; return false }
            }
            return true
        })
        .map(v => {
            const isBrand = brandLower.length >= 3 && v.keyword.toLowerCase().includes(brandLower)
            const intent = classifyIntent(v.keyword, undefined, isBrand)
            // Top-of-page bid range — DFS doesn't always return; approximate cpc ± 20%
            const cpc = v.cpc
            const lowBid = cpc !== null ? Number((cpc * 0.85).toFixed(2)) : null
            const highBid = cpc !== null ? Number((cpc * 1.15).toFixed(2)) : null
            // Rough daily-budget estimate at ~1% CTR + 30 ad-impressions/day
            const estCtr = 0.01
            const estClicksPerDay = (v.search_volume || 0) / 30 * estCtr
            const dailyBudget = cpc !== null ? Number((estClicksPerDay * cpc).toFixed(2)) : null

            return {
                keyword: v.keyword,
                searchVolume: v.search_volume || 0,
                cpc, lowTopOfPageBid: lowBid, highTopOfPageBid: highBid,
                competition: v.competition,
                competitionIndex: v.competition_index,
                keywordDifficulty: null,    // not fetched yet — bulk KD is a separate call we can add later
                intentTier: intent.tier,
                intentRationale: intent.rationale,
                rankedCompetitors: [],       // populated in next pass once we know who ranks
                isBrandKeyword: isBrand,
                estimatedDailyBudgetIls: dailyBudget,
            }
        })
        // Sort by value proxy: search_volume × (1 + 0.5 if BOFU + 0.2 if MOFU)
        .map(k => ({
            ...k,
            __score: k.searchVolume * (k.intentTier === 'BOFU' ? 1.5 : k.intentTier === 'MOFU' ? 1.2 : 1.0),
        }))
        .sort((a, b) => b.__score - a.__score)
        .slice(0, maxKw)
        .map(k => { const { __score, ...rest } = k; void __score; return rest })

    diagnostics.keywordsAfterVolumeFilter = paidKeywords.length
    diagnostics.keywordsDroppedByBlocklist = droppedByBlocklist

    // 5. Cluster + benchmarks + intent distribution
    const clusters = clusterKeywords(paidKeywords)
    const ilBenchmarks = computeIlBenchmarks(paidKeywords)
    const intentDistribution: Record<IntentTier, number> = { TOFU: 0, MOFU: 0, BOFU: 0, BRAND: 0, UNKNOWN: 0 }
    for (const k of paidKeywords) intentDistribution[k.intentTier]++

    diagnostics.latencyMs = Date.now() - startedAt

    return {
        available: paidKeywords.length > 0,
        reason: paidKeywords.length === 0 ? 'No keywords with sufficient IL volume (≥10/mo)' : undefined,
        diagnostics,
        keywords: paidKeywords,
        clusters,
        ilBenchmarks,
        intentDistribution,
        sqrTopConverters: opts.sqrTopConverters,
    }
}

/**
 * Render the landscape as prompt-ready context block.
 */
export function renderPaidKeywordLandscapeForPrompt(r: PaidKeywordLandscape): string {
    if (!r.available) {
        return `═══ PAID KEYWORD LANDSCAPE (IL) ═══\n\n(${r.reason || 'unavailable'})\n\nDiagnostics: calls=${r.diagnostics.callsAttempted}, failed=${r.diagnostics.callsFailed}, cost=$${r.diagnostics.totalCostUsd.toFixed(3)}`
    }
    const top = r.keywords.slice(0, 30)
    const tableRows = top.map((k, i) =>
        `${i + 1}. ${k.keyword} | vol=${k.searchVolume} | cpc=₪${k.cpc?.toFixed(2) || '?'} | bid=${k.lowTopOfPageBid !== null ? `₪${k.lowTopOfPageBid}-₪${k.highTopOfPageBid}` : '?'} | comp=${k.competition || '?'} | intent=${k.intentTier}`,
    ).join('\n')

    const clusterBlock = r.clusters.slice(0, 8).map(c =>
        `   • ${c.label}: ${c.keywords.length} kw, vol=${c.totalMonthlyVolume}, avgCpc=₪${c.avgCpc?.toFixed(2) || '?'}, intent=${c.dominantIntent}`,
    ).join('\n')

    // Phase 4.2.1-H — surface SQR top-converters as Tier-1 keywords with REAL
    // performance (this beats any DFS estimate). Opus must include these in
    // an Exact-match ad group and use their CPA as the account benchmark.
    let sqrBlock = ''
    if (r.sqrTopConverters && r.sqrTopConverters.length > 0) {
        const lines = r.sqrTopConverters.map((t, i) =>
            `   ${i + 1}. "${t.searchTerm}" — ${t.conversions} conv @ CPA ₪${t.cpa} (${t.clicks} clicks)`,
        ).join('\n')
        sqrBlock = `\n**🎯 TIER-1 SEEDS — SQR PROVEN CONVERTERS (REAL ACCOUNT DATA)** ⚠️ CRITICAL\n${lines}\n
These are ACTUAL search queries that have converted in this account over the last 90 days.
They are NOT DFS estimates — they are ground truth. RULES:
- Every term above MUST appear as an exact-match keyword in your output
- Group them into a dedicated Tier-1 ad group ("BOFU — proven converters")
- Use their median CPA as the account-realistic benchmark (NOT industry CPA)
- Account-level CR for these terms drives Stage 3 budget scenarios — your output's CR claims for similar terms cannot exceed this baseline by more than 30%
`
    }

    let blocklistNote = ''
    if (r.diagnostics.keywordsDroppedByBlocklist && r.diagnostics.keywordsDroppedByBlocklist > 0) {
        blocklistNote = `\n📛 ${r.diagnostics.keywordsDroppedByBlocklist} candidate keywords were dropped pre-prompt by the out-of-vertical blocklist (apartment rentals, generic info, cloud-storage bleed, SQR-derived waste). They will NOT appear below.\n`
    }

    return [
        '═══ PAID KEYWORD LANDSCAPE (IL — Israel) ═══',
        '',
        `Total keywords analyzed: ${r.keywords.length} (from ${r.diagnostics.keywordsAfterExpansion} candidates)`,
        `Intent distribution: TOFU=${r.intentDistribution.TOFU}, MOFU=${r.intentDistribution.MOFU}, BOFU=${r.intentDistribution.BOFU}, BRAND=${r.intentDistribution.BRAND}, UNKNOWN=${r.intentDistribution.UNKNOWN}`,
        `IL CPC benchmarks: median=₪${r.ilBenchmarks.medianCpcIls?.toFixed(2) || '?'}, p25=₪${r.ilBenchmarks.p25CpcIls?.toFixed(2) || '?'}, p75=₪${r.ilBenchmarks.p75CpcIls?.toFixed(2) || '?'}`,
        r.ilBenchmarks.highestVolumeKeyword ? `Highest volume: "${r.ilBenchmarks.highestVolumeKeyword}"` : '',
        r.ilBenchmarks.cheapestKeywordWithVolume ? `Cheapest with real volume: "${r.ilBenchmarks.cheapestKeywordWithVolume}"` : '',
        blocklistNote,
        sqrBlock,
        `**TOP 30 KEYWORDS** (sorted by intent-weighted value):`,
        tableRows,
        '',
        `**SEMANTIC CLUSTERS** (${r.clusters.length} found):`,
        clusterBlock || '   (no clusters formed — keyword pool too sparse)',
        '',
        'USE THIS TO REASON ABOUT:',
        '- BOFU keywords = exact-match, manual or tCPA bidding (high intent — pay premium)',
        '- MOFU keywords = phrase-match, Max Conversions (research stage — capture for retargeting)',
        '- TOFU keywords = broad-match, Max Clicks (low intent — careful with budget allocation)',
        '- Cluster structure → ad group recommendation (1 cluster = 1 ad group, share match types)',
        '- CPC vs IL median: keyword above p75 = expensive; below p25 = bargain (but check volume)',
    ].filter(Boolean).join('\n')
}