/**
 * DataForSEO response types.
 *
 * Only the fields we actually consume — DFS responses are large and
 * over-typing them creates churn whenever they tweak field names. We
 * keep `[key: string]: unknown` index signatures so unknown fields
 * don't blow up TypeScript when DFS adds a column.
 *
 * Reference: https://docs.dataforseo.com/v3/
 */

// ── Envelope ────────────────────────────────────────────────────────────────

export interface DfsEnvelope<T> {
    /** 20000 = OK; 40501 = no credits; 40100 = invalid auth; 40000 = bad request */
    status_code: number
    status_message: string
    /** Cost in USD for this call. Reported by DFS. */
    cost: number
    tasks_count: number
    tasks_error: number
    tasks?: Array<{
        id: string
        status_code: number
        status_message: string
        cost: number
        result?: T[] | null
    }>
}

// ── Common shared types ────────────────────────────────────────────────────

export interface DfsLocation {
    location_code: number
    /** "he" or "en". DFS supports many — we use these two for IL. */
    language_code: 'he' | 'en'
}

/**
 * Israel location_code per DataForSEO locations table.
 * Used by endpoints that accept code form: keywords_data, serp, business_data.
 * DataForSEO Labs endpoints reject location_code — use location_name 'Israel' instead.
 */
export const LOCATION_IL = 2376
export const LOCATION_NAME_IL = 'Israel'
export const LANGUAGE_HE = 'he' as const
export const LANGUAGE_EN = 'en' as const
export const LANGUAGE_NAME_HE = 'Hebrew'
export const LANGUAGE_NAME_EN = 'English'

/** Map ISO language codes to DFS Labs `language_name` values. */
export function languageName(code: 'he' | 'en'): string {
    return code === 'en' ? LANGUAGE_NAME_EN : LANGUAGE_NAME_HE
}

// ── Search Volume ──────────────────────────────────────────────────────────

export interface SearchVolumeItem {
    keyword: string
    location_code: number
    language_code: string
    search_volume: number | null
    cpc: number | null
    competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
    competition_index: number | null
    monthly_searches?: Array<{ year: number; month: number; search_volume: number }>
    [key: string]: unknown
}

// ── Keyword Ideas / Related Keywords ───────────────────────────────────────

export interface KeywordIdeasItem {
    keyword: string
    keyword_info?: {
        search_volume: number | null
        cpc: number | null
        competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
        competition_index: number | null
        keyword_difficulty?: number | null
    }
    keyword_properties?: {
        keyword_difficulty: number | null
    }
    search_intent_info?: {
        main_intent: 'informational' | 'navigational' | 'commercial' | 'transactional'
        foreign_intent?: string[]
    }
    [key: string]: unknown
}

// ── Keyword Difficulty ─────────────────────────────────────────────────────

export interface KeywordDifficultyItem {
    keyword: string
    keyword_difficulty: number | null
}

// ── SERP Live Advanced ─────────────────────────────────────────────────────
//
// SERP results are the most heterogeneous endpoint — `items` is a
// polymorphic list. We narrow per-item via type discriminator.

export interface SerpResult {
    keyword: string
    location_code: number
    language_code: string
    se_domain: string
    /** Total items returned in the SERP page (organic + features). */
    items_count: number
    items: SerpItem[]
    /** SERP feature flags computed from items by our server-side parser. */
    [key: string]: unknown
}

export type SerpItem =
    | SerpOrganicItem
    | SerpAiOverviewItem
    | SerpPaaItem
    | SerpFeaturedSnippetItem
    | SerpVideoItem
    | SerpImagesItem
    | SerpLocalPackItem
    | SerpShoppingItem
    | SerpRelatedSearchesItem
    | SerpUnknownItem

export interface SerpOrganicItem {
    type: 'organic'
    rank_group: number
    rank_absolute: number
    domain: string
    title: string
    description: string
    url: string
    breadcrumb?: string
    is_featured_snippet?: boolean
    is_malicious?: boolean
    is_web_story?: boolean
    [key: string]: unknown
}

export interface SerpAiOverviewItem {
    type: 'ai_overview'
    items: Array<{ title?: string; text?: string; url?: string; domain?: string }>
    [key: string]: unknown
}

export interface SerpPaaItem {
    type: 'people_also_ask'
    items: Array<{ type: string; title: string; expanded_element?: unknown[] }>
    [key: string]: unknown
}

export interface SerpFeaturedSnippetItem {
    type: 'featured_snippet'
    domain: string
    title: string
    description: string
    url: string
    [key: string]: unknown
}

export interface SerpVideoItem {
    type: 'video'
    items: Array<{ source: string; title: string; url: string }>
    [key: string]: unknown
}

export interface SerpImagesItem {
    type: 'images'
    items: Array<{ title?: string; image_url?: string; url?: string }>
    [key: string]: unknown
}

export interface SerpLocalPackItem {
    type: 'local_pack'
    title?: string
    domain?: string
    url?: string
    rating?: { value: number; votes_count: number }
    [key: string]: unknown
}

export interface SerpShoppingItem {
    type: 'shopping'
    items: Array<{ title: string; price?: { current?: number; currency?: string }; seller?: string; url?: string }>
    [key: string]: unknown
}

export interface SerpRelatedSearchesItem {
    type: 'related_searches'
    items: string[]
    [key: string]: unknown
}

export interface SerpUnknownItem {
    type: string
    [key: string]: unknown
}

// ── Ranked Keywords (domain-level rankings) ────────────────────────────────

export interface RankedKeywordItem {
    keyword_data: {
        keyword: string
        keyword_info?: {
            search_volume: number | null
            cpc: number | null
            keyword_difficulty?: number | null
        }
    }
    ranked_serp_element: {
        serp_item: {
            type: string
            rank_absolute: number
            url: string
            title: string
            description?: string
        }
    }
    [key: string]: unknown
}

// ── Competitors Domain (domain-level competitor discovery) ─────────────────

export interface CompetitorsDomainItem {
    se_type: string
    domain: string
    avg_position: number
    sum_position: number
    intersections: number       // shared keywords
    full_domain_metrics?: {
        organic?: { count: number; etv: number; impressions_etv?: number; pos_1?: number; pos_2_3?: number; pos_4_10?: number }
    }
    [key: string]: unknown
}

// ── SERP Competitors per keyword ───────────────────────────────────────────

export interface SerpCompetitorsItem {
    domain: string
    avg_position: number
    sum_position: number
    intersections: number
    [key: string]: unknown
}

// ── Backlinks Summary ──────────────────────────────────────────────────────

export interface BacklinksSummary {
    target: string
    rank: number
    backlinks: number
    backlinks_spam_score: number
    referring_domains: number
    referring_main_domains: number
    referring_ips: number
    referring_subnets: number
    referring_pages: number
    referring_links_tld?: Record<string, number>
    referring_links_types?: Record<string, number>
    referring_links_attributes?: Record<string, number>
    referring_links_platform_types?: Record<string, number>
    referring_links_semantic_locations?: Record<string, number>
    referring_links_countries?: Record<string, number>
    [key: string]: unknown
}

// ── Backlinks Anchors ──────────────────────────────────────────────────────

export interface BacklinksAnchorItem {
    anchor: string
    backlinks: number
    referring_domains: number
    referring_main_domains: number
    rank: number
    [key: string]: unknown
}

// ── Backlinks Referring Domains ────────────────────────────────────────────

export interface ReferringDomainItem {
    domain: string
    rank: number
    backlinks: number
    first_seen: string
    lost_date?: string
    is_lost?: boolean
    referring_pages?: number
    /** Live-verification of a DFS "lost" classification (link_audit). DFS lost
     * signals are lagging + false-positive-prone (esp. JS-rendered IL editorial
     * widgets). 'still_live' = source page still links to us (DFS false positive);
     * 'confirmed_lost' = fetched the source, link genuinely gone; 'unverified' =
     * couldn't fetch/render. Only 'confirmed_lost' should drive a paid recovery. */
    _verification?: 'still_live' | 'confirmed_lost' | 'unverified'
    /** Source page URLs (url_from) checked during verification. */
    _verifiedSourceUrls?: string[]
    [key: string]: unknown
}

/** A single page-level backlink (backlinks/backlinks/live), incl. lost ones. */
export interface LostBacklinkItem {
    domain_from?: string
    url_from?: string
    url_to?: string
    anchor?: string
    is_lost?: boolean
    dofollow?: boolean
    last_seen?: string
    first_seen?: string
    [key: string]: unknown
}

// ── Backlinks Competitors (link-gap) ───────────────────────────────────────

export interface BacklinksCompetitorItem {
    target: string
    rank: number
    backlinks: number
    referring_domains: number
    intersections: number       // referring domains shared with our target
    [key: string]: unknown
}

// ── On-Page Instant ────────────────────────────────────────────────────────

export interface OnPageItem {
    url: string
    meta?: {
        title?: string
        description?: string
        canonical?: string
        /** Heading tags. Actual DFS path is `meta.htags.h1` (not `meta.h1`).
         *  The legacy h1/h2 fields below are kept ONLY for forward-compat with
         *  callers that already read them; new code must use `htags.h1` etc. */
        htags?: {
            h1?: string[]
            h2?: string[]
            h3?: string[]
            h4?: string[]
            h5?: string[]
            h6?: string[]
        }
        /** @deprecated DFS does NOT put h1 here — use `meta.htags.h1`. */
        h1?: string[]
        /** @deprecated DFS does NOT put h2 here — use `meta.htags.h2`. */
        h2?: string[]
        scripts?: string[]
        social_media_tags?: Record<string, string>
        content?: {
            plain_text_size?: number
            plain_text_word_count?: number
            plain_text_rate?: number
            automated_readability_index?: number
            description_to_content_consistency?: number
            title_to_content_consistency?: number
        }
    }
    /** Boolean check matrix DFS emits per page. Use these as ground truth
     *  for "no_h1_tag", "no_title", "no_description", "is_redirect", etc —
     *  they're DFS's own deterministic verdict on the rendered HTML. */
    checks?: Record<string, boolean>
    page_timing?: {
        time_to_interactive?: number
        dom_complete?: number
        largest_contentful_paint?: number
        first_input_delay?: number
        connection_time?: number
        time_to_secure_connection?: number
        request_sent_time?: number
        waiting_time?: number
        download_time?: number
        duration_time?: number
        fetch_start?: number
        fetch_end?: number
    }
    onpage_score?: number
    total_dom_size?: number
    /** Schema markup detected on the page. */
    schema?: Array<{ type: string; data?: unknown }>
    /** Structured data summary — cleaner than raw schema array */
    [key: string]: unknown
}

// ── Google My Business ─────────────────────────────────────────────────────

export interface GoogleMyBusinessItem {
    title: string
    address?: string
    phone?: string
    rating?: { value: number; votes_count: number; rating_max: number }
    snippet?: string
    main_image_url?: string
    work_hours?: { timetable?: Record<string, Array<{ open: { hour: number; minute: number }; close: { hour: number; minute: number } }>> }
    categories?: string[]
    additional_categories?: string[]
    place_id?: string
    cid?: string
    is_claimed?: boolean
    [key: string]: unknown
}

// ── Trustpilot Reviews ─────────────────────────────────────────────────────

export interface TrustpilotReviewItem {
    rating?: { value: number; votes_count: number; rating_max: number }
    title?: string
    text?: string
    timestamp?: string
    user_profile?: { name?: string; reviews_count?: number }
    [key: string]: unknown
}

// ── Google Business Reviews ────────────────────────────────────────────────
// Phase E2.4. Per-place review data from DFS business_data/google/reviews/live.
// Used for sentiment aggregation of competitors' actual customer reviews.

export interface GoogleReviewItem {
    /** Reviewer's name (often anonymous on Google) */
    profile_name?: string
    /** Local Guide level when applicable */
    profile_level?: number
    /** 1-5 stars given by this reviewer */
    rating?: { value?: number; rating_max?: number }
    /** Hebrew or English review text — main signal source */
    review_text?: string
    /** Original language reported by Google */
    original_language?: string
    /** Translated text when DFS auto-translates */
    translated_text?: string
    /** When the review was posted (ISO) */
    timestamp?: string
    /** Owner's response to the review (if present) */
    response?: { text?: string; timestamp?: string }
    [key: string]: unknown
}