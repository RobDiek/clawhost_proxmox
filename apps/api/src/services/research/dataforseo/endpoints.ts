/**
 * DataForSEO endpoint wrappers — one function per endpoint we use during
 * research stages. Each wrapper:
 *
 *   1. Checks per-tenant cache via cache.cacheGet (per-endpoint TTL)
 *   2. On miss: calls dfsPost (hard-fails on DFS error per playbook §17)
 *   3. Stores response in cache via cache.cacheSet
 *   4. Returns typed result + accumulated cost (for logging only —
 *      tenant pays directly, we don't bill)
 *
 * Defaults: location_code=2316 (Israel), language='he'. Override per-call
 * for global B2B / English-corpus research.
 *
 * Premium budget tier (playbook §17): we fetch generous batch sizes by
 * default (700 keyword ideas, top 100 ranked keywords, etc.) — quality
 * over cost. Caller can pass `limit` to trim if needed.
 */

import { dfsPost } from './client'
import { cacheGet, cacheSet } from './cache'
import {
    LOCATION_IL, LANGUAGE_HE, LOCATION_NAME_IL, languageName,
    type SearchVolumeItem,
    type KeywordIdeasItem,
    type KeywordDifficultyItem,
    type SerpResult,
    type RankedKeywordItem,
    type CompetitorsDomainItem,
    type SerpCompetitorsItem,
    type BacklinksSummary,
    type BacklinksAnchorItem,
    type ReferringDomainItem,
    type BacklinksCompetitorItem,
    type OnPageItem,
    type GoogleMyBusinessItem,
    type TrustpilotReviewItem,
    type GoogleReviewItem,
} from './types'

interface CallResult<T> {
    items: T[]
    /** Cost in USD (0 on cache hit). */
    cost: number
    /** Whether this came from cache. */
    cached: boolean
}

interface LocLang {
    location_code?: number
    language_code?: 'he' | 'en'
}

/**
 * Generic cached call — wraps dfsPost with cache check/store.
 * Returns items[] from result[0] (DFS-specific shape — most endpoints
 * put their array under a single result entry).
 */
async function cachedCall<TItem>(
    instanceId: string,
    endpoint: string,
    params: object,
    /** Optional extractor — defaults to result[0].items, override for endpoints with non-standard shape */
    extract?: (result: unknown[]) => TItem[],
): Promise<CallResult<TItem>> {
    type CacheShape = { items: TItem[]; cost: number }
    const cached = await cacheGet<CacheShape>(instanceId, endpoint, params)
    if (cached) return { items: cached.items, cost: 0, cached: true }

    const { result, cost } = await dfsPost<unknown>(instanceId, endpoint, [params])
    const items = extract ? extract(result) : extractDefault<TItem>(result)
    await cacheSet(instanceId, endpoint, params, { items, cost }, cost)
    return { items, cost, cached: false }
}

/**
 * Default extractor: result is `[{ items: [...] }]`. Most DFS endpoints
 * follow this shape. SERP and a few others differ — those pass custom
 * extractors.
 */
function extractDefault<T>(result: unknown[]): T[] {
    if (!Array.isArray(result) || result.length === 0) return []
    const first = result[0] as { items?: T[] }
    return Array.isArray(first?.items) ? first.items : []
}

// ────────────────────────────────────────────────────────────────────────────
// Keywords data
// ────────────────────────────────────────────────────────────────────────────

/**
 * Search volumes via Google Ads. Free-of-charge data within DFS — fetches
 * monthly volume + CPC + competition for up to 1000 keywords per call.
 * Endpoint: keywords_data/google_ads/search_volume/live
 */
export async function searchVolume(
    instanceId: string,
    keywords: string[],
    opts: LocLang = {},
): Promise<CallResult<SearchVolumeItem>> {
    // DataForSEO inconsistency — Google Ads endpoints (this one) want
    // Google's internal legacy ISO codes for some languages: Hebrew = `iw`
    // (NOT `he`). DFS Labs endpoints want `language_name: "Hebrew"` which
    // is a different format entirely. Sending `he` here returns 40501
    // "Invalid Field: language_code" silently → empty result. We map our
    // canonical `he`/`en` codes to whatever Google Ads accepts.
    const code = opts.language_code ?? LANGUAGE_HE
    const googleAdsLang = code === 'he' ? 'iw' : code
    const params = {
        keywords: keywords.slice(0, 1000),  // hard cap per DFS spec
        location_code: opts.location_code ?? LOCATION_IL,
        language_code: googleAdsLang,
    }
    // DataForSEO Google Ads endpoints (unlike Labs endpoints) put items
    // DIRECTLY in `result[]` as a flat array, not wrapped in `result[0].items`.
    // For 5 keywords sent: response.tasks[0].result.length === 5, each entry
    // is a SearchVolumeItem. Default extractor returns [] for this shape.
    return cachedCall<SearchVolumeItem>(
        instanceId,
        'keywords_data/google_ads/search_volume/live',
        params,
        (result) => Array.isArray(result) ? (result as SearchVolumeItem[]) : [],
    )
}

/**
 * Keyword ideas — DataForSEO Labs. Returns up to 700 related keywords with
 * volume, CPC, search_intent, difficulty. The bread-and-butter call for
 * seo_keyword_research stage.
 * Endpoint: dataforseo_labs/google/keyword_ideas/live
 */
export async function keywordIdeas(
    instanceId: string,
    seedKeywords: string[],
    opts: LocLang & { limit?: number; include_serp_info?: boolean } = {},
): Promise<CallResult<KeywordIdeasItem>> {
    // DFS Labs endpoints want location_name + language_name (reject _code).
    const params = {
        keywords: seedKeywords.slice(0, 200),
        location_name: LOCATION_NAME_IL,
        language_name: languageName(opts.language_code ?? LANGUAGE_HE),
        limit: opts.limit ?? 700,
        include_serp_info: opts.include_serp_info ?? true,
    }
    return cachedCall<KeywordIdeasItem>(
        instanceId,
        'dataforseo_labs/google/keyword_ideas/live',
        params,
    )
}

/**
 * Related keywords — semantic graph expansion (different from keyword_ideas
 * which uses Google's "related" surface). Useful for cluster discovery.
 * Endpoint: dataforseo_labs/google/related_keywords/live
 */
export async function relatedKeywords(
    instanceId: string,
    seed: string,
    opts: LocLang & { limit?: number; depth?: number } = {},
): Promise<CallResult<KeywordIdeasItem>> {
    const params = {
        keyword: seed,
        location_name: LOCATION_NAME_IL,
        language_name: languageName(opts.language_code ?? LANGUAGE_HE),
        limit: opts.limit ?? 200,
        depth: opts.depth ?? 2,
    }
    return cachedCall<KeywordIdeasItem>(
        instanceId,
        'dataforseo_labs/google/related_keywords/live',
        params,
    )
}

/**
 * Keyword difficulty — bulk endpoint. Cheaper than fetching difficulty per
 * keyword individually; preferred when we already have a candidate list
 * from keyword_ideas and want to filter by KD.
 * Endpoint: dataforseo_labs/google/bulk_keyword_difficulty/live
 */
export async function keywordDifficulty(
    instanceId: string,
    keywords: string[],
    opts: LocLang = {},
): Promise<CallResult<KeywordDifficultyItem>> {
    const params = {
        keywords: keywords.slice(0, 1000),
        location_name: LOCATION_NAME_IL,
        language_name: languageName(opts.language_code ?? LANGUAGE_HE),
    }
    return cachedCall<KeywordDifficultyItem>(
        instanceId,
        'dataforseo_labs/google/bulk_keyword_difficulty/live',
        params,
    )
}

// ────────────────────────────────────────────────────────────────────────────
// SERP
// ────────────────────────────────────────────────────────────────────────────

/**
 * Live advanced SERP — returns full SERP with all features (AIO, PAA,
 * Featured Snippet, video, image, local pack, shopping). One keyword per
 * call (DFS bills per query).
 *
 * Returns the full SerpResult with `items[]`. Server-side parsing of
 * features → flags happens via parseSerpFeatures() utility.
 * Endpoint: serp/google/organic/live/advanced
 */
export async function serpAdvanced(
    instanceId: string,
    keyword: string,
    opts: LocLang & { device?: 'desktop' | 'mobile'; depth?: number } = {},
): Promise<CallResult<SerpResult>> {
    const params = {
        keyword,
        location_code: opts.location_code ?? LOCATION_IL,
        language_code: opts.language_code ?? LANGUAGE_HE,
        device: opts.device ?? 'mobile',  // IL is mobile-first per playbook §6
        depth: opts.depth ?? 100,
    }
    return cachedCall<SerpResult>(
        instanceId,
        'serp/google/organic/live/advanced',
        params,
        (result) => result as SerpResult[],  // result IS the array of SerpResult
    )
}

/**
 * Detect which SERP features are present in a result. Returns a set
 * of feature flags ready for the methodology SerpFeature enum.
 *
 * Pure function — no I/O. Stage prompts use this to inject feature
 * presence into the per-keyword JSON record.
 */
export function parseSerpFeatures(serp: SerpResult): {
    has_ai_overview: boolean
    has_people_also_ask: boolean
    has_featured_snippet: boolean
    has_video_carousel: boolean
    has_image_pack: boolean
    has_local_pack: boolean
    has_shopping_carousel: boolean
    organic_top_3: Array<{ url: string; domain: string; title: string; description: string }>
    paa_questions: string[]
    aio_cited_domains: string[]
} {
    const flags = {
        has_ai_overview: false,
        has_people_also_ask: false,
        has_featured_snippet: false,
        has_video_carousel: false,
        has_image_pack: false,
        has_local_pack: false,
        has_shopping_carousel: false,
        organic_top_3: [] as Array<{ url: string; domain: string; title: string; description: string }>,
        paa_questions: [] as string[],
        aio_cited_domains: [] as string[],
    }
    let organicCount = 0
    for (const item of serp.items || []) {
        switch (item.type) {
            case 'ai_overview':
                flags.has_ai_overview = true
                if ('items' in item && Array.isArray(item.items)) {
                    for (const sub of item.items) {
                        if (sub.domain) flags.aio_cited_domains.push(sub.domain)
                    }
                }
                break
            case 'people_also_ask':
                flags.has_people_also_ask = true
                if ('items' in item && Array.isArray(item.items)) {
                    for (const q of item.items) {
                        if (q.title) flags.paa_questions.push(q.title)
                    }
                }
                break
            case 'featured_snippet':  flags.has_featured_snippet = true; break
            case 'video':             flags.has_video_carousel = true; break
            case 'images':            flags.has_image_pack = true; break
            case 'local_pack':        flags.has_local_pack = true; break
            case 'shopping':          flags.has_shopping_carousel = true; break
            case 'organic':
                if (organicCount < 3) {
                    const o = item as typeof item & { url: string; domain: string; title: string; description: string }
                    flags.organic_top_3.push({
                        url: o.url, domain: o.domain, title: o.title, description: o.description,
                    })
                    organicCount++
                }
                break
        }
    }
    return flags
}

// ────────────────────────────────────────────────────────────────────────────
// DataForSEO Labs — domain-level intelligence
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ranked keywords for a domain — what keywords does this domain currently
 * rank for? Used for striking-distance + branded-vs-unbranded SoV analysis.
 * Premium tier default: top 100.
 * Endpoint: dataforseo_labs/google/ranked_keywords/live
 */
export async function rankedKeywords(
    instanceId: string,
    target: string,
    opts: LocLang & { limit?: number; filters?: unknown[] } = {},
): Promise<CallResult<RankedKeywordItem>> {
    const params = {
        target,
        location_name: LOCATION_NAME_IL,
        language_name: languageName(opts.language_code ?? LANGUAGE_HE),
        limit: opts.limit ?? 100,
        load_rank_absolute: true,
        ...(opts.filters ? { filters: opts.filters } : {}),
    }
    return cachedCall<RankedKeywordItem>(
        instanceId,
        'dataforseo_labs/google/ranked_keywords/live',
        params,
    )
}

/**
 * Domain-level competitors — domains ranking on the same keyword set.
 * The "who's in our SERP space" call. Premium tier: top 50 competitors.
 * Endpoint: dataforseo_labs/google/competitors_domain/live
 */
export async function competitorsDomain(
    instanceId: string,
    target: string,
    opts: LocLang & { limit?: number; intersections?: number } = {},
): Promise<CallResult<CompetitorsDomainItem>> {
    const params = {
        target,
        location_name: LOCATION_NAME_IL,
        language_name: languageName(opts.language_code ?? LANGUAGE_HE),
        limit: opts.limit ?? 50,
        intersections: opts.intersections ?? 5,  // min 5 shared keywords
    }
    return cachedCall<CompetitorsDomainItem>(
        instanceId,
        'dataforseo_labs/google/competitors_domain/live',
        params,
    )
}

/**
 * SERP competitors — top domains across a keyword set. Used to validate
 * "5 direct competitors" claim with real SERP data, not agent guessing.
 * Endpoint: dataforseo_labs/google/serp_competitors/live
 */
export async function serpCompetitors(
    instanceId: string,
    keywords: string[],
    opts: LocLang & { limit?: number } = {},
): Promise<CallResult<SerpCompetitorsItem>> {
    const params = {
        keywords: keywords.slice(0, 200),
        location_name: LOCATION_NAME_IL,
        language_name: languageName(opts.language_code ?? LANGUAGE_HE),
        limit: opts.limit ?? 50,
    }
    return cachedCall<SerpCompetitorsItem>(
        instanceId,
        'dataforseo_labs/google/serp_competitors/live',
        params,
    )
}

// ────────────────────────────────────────────────────────────────────────────
// Backlinks — link intelligence (replaces Ahrefs/Semrush per playbook §16)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Link profile summary — referring_domains, backlinks count, spam score,
 * TLD distribution, country distribution. Always-on signal #3 from §6.
 * Endpoint: backlinks/summary/live
 */
export async function backlinksSummary(
    instanceId: string,
    target: string,
): Promise<CallResult<BacklinksSummary>> {
    const params = {
        target,
        internal_list_limit: 10,
        backlinks_status_type: 'live' as const,
    }
    return cachedCall<BacklinksSummary>(
        instanceId,
        'backlinks/summary/live',
        params,
        // backlinks/summary returns a single object as result[0], not an array
        (result) => Array.isArray(result) ? (result as BacklinksSummary[]) : [],
    )
}

/**
 * Anchor text patterns — what text are competitors getting linked to as?
 * Reveals brand vs commercial vs spam-anchor mix.
 * Endpoint: backlinks/anchors/live
 */
export async function backlinksAnchors(
    instanceId: string,
    target: string,
    opts: { limit?: number } = {},
): Promise<CallResult<BacklinksAnchorItem>> {
    const params = {
        target,
        limit: opts.limit ?? 100,
        backlinks_status_type: 'live' as const,
    }
    return cachedCall<BacklinksAnchorItem>(
        instanceId,
        'backlinks/anchors/live',
        params,
    )
}

/**
 * Referring domains list — every domain pointing at the target, sorted by
 * rank. Used for backlink-worthy assets inventory + lost-link recovery.
 * Endpoint: backlinks/referring_domains/live
 */
export async function backlinksReferringDomains(
    instanceId: string,
    target: string,
    opts: { limit?: number; include_lost?: boolean } = {},
): Promise<CallResult<ReferringDomainItem>> {
    const params = {
        target,
        limit: opts.limit ?? 100,
        backlinks_status_type: opts.include_lost ? ('all' as const) : ('live' as const),
        order_by: ['rank,desc'],
    }
    return cachedCall<ReferringDomainItem>(
        instanceId,
        'backlinks/referring_domains/live',
        params,
    )
}

/**
 * Link-gap analysis — domains linking to competitors but NOT to us.
 * High-leverage outreach target list.
 * Endpoint: backlinks/competitors/live
 */
export async function backlinksCompetitors(
    instanceId: string,
    target: string,
    opts: { limit?: number } = {},
): Promise<CallResult<BacklinksCompetitorItem>> {
    const params = {
        target,
        limit: opts.limit ?? 50,
    }
    return cachedCall<BacklinksCompetitorItem>(
        instanceId,
        'backlinks/competitors/live',
        params,
    )
}

// ────────────────────────────────────────────────────────────────────────────
// On-Page audit
// ────────────────────────────────────────────────────────────────────────────

/**
 * Single-URL audit — fetches the page, parses meta/structure/schema/timing.
 * Used to grade competitor pages for content_system_maturity scoring.
 * Endpoint: on_page/instant_pages
 */
export async function onPageInstant(
    instanceId: string,
    url: string,
    opts: { enable_javascript?: boolean; load_resources?: boolean } = {},
): Promise<CallResult<OnPageItem>> {
    const params = {
        url,
        enable_javascript: opts.enable_javascript ?? true,
        load_resources: opts.load_resources ?? false,  // resources rarely needed for our use
        custom_js: 'meta = {}; meta.title = document.title; meta;',
    }
    return cachedCall<OnPageItem>(
        instanceId,
        'on_page/instant_pages',
        params,
        (result) => {
            // result[0].items contains pages; we requested one URL, take first
            if (!Array.isArray(result) || result.length === 0) return []
            const r = result[0] as { items?: OnPageItem[] }
            return Array.isArray(r.items) ? r.items : []
        },
    )
}

// ────────────────────────────────────────────────────────────────────────────
// Business data
// ────────────────────────────────────────────────────────────────────────────

/**
 * Google My Business profile lookup — categories, hours, reviews summary,
 * place_id. Used for IL local-trust signals (playbook §6).
 * Endpoint: business_data/google/my_business_info/live
 */
export async function googleMyBusiness(
    instanceId: string,
    keyword: string,
    opts: LocLang = {},
): Promise<CallResult<GoogleMyBusinessItem>> {
    const params = {
        keyword,
        location_code: opts.location_code ?? LOCATION_IL,
        language_code: opts.language_code ?? LANGUAGE_HE,
    }
    return cachedCall<GoogleMyBusinessItem>(
        instanceId,
        'business_data/google/my_business_info/live',
        params,
    )
}

/**
 * Trustpilot reviews — for review-mining at competitor analysis stage.
 * Endpoint: business_data/trustpilot/reviews/live
 */
export async function trustpilotReviews(
    instanceId: string,
    domain: string,
    opts: { limit?: number } = {},
): Promise<CallResult<TrustpilotReviewItem>> {
    const params = {
        domain,
        depth: opts.limit ?? 100,
    }
    return cachedCall<TrustpilotReviewItem>(
        instanceId,
        'business_data/trustpilot/reviews/live',
        params,
    )
}

/**
 * Google Business reviews — Phase E2.4. Per-place customer reviews.
 *
 * Endpoint: business_data/google/reviews/live
 *
 * Phase 4.0(fix4): DFS's docs claim `keyword` accepts business name,
 * CID, or place_id — but in practice CIDs return 404 ("No Search
 * Results") roughly half the time even when the CID is valid (verified
 * against Google Maps). Empirically the business NAME with location_code
 * is the most reliable strategy. Caller is expected to try
 * matchedTitle first (from googleMyBusiness response.title) and only
 * fall back to CID/place_id when title isn't available.
 *
 * For IL businesses, this is the most reliable review source — Trustpilot
 * coverage is sparse for the Israeli market while almost every brick-and-
 * mortar business has Google reviews.
 */
export async function googleReviews(
    instanceId: string,
    keywordOrCidOrPlaceId: string,
    opts: { limit?: number; sortBy?: 'newest' | 'highest_rating' | 'lowest_rating' | 'most_relevant'; location_code?: number; language_code?: string } = {},
): Promise<CallResult<GoogleReviewItem>> {
    const params: Record<string, unknown> = {
        keyword: keywordOrCidOrPlaceId,
        depth: opts.limit ?? 100,
        sort_by: opts.sortBy ?? 'newest',
    }
    if (opts.location_code) params.location_code = opts.location_code
    if (opts.language_code) params.language_code = opts.language_code
    return cachedCall<GoogleReviewItem>(
        instanceId,
        'business_data/google/reviews/live',
        params,
    )
}