/**
 * DataForSEO pre-fetch for competitor_landscape stage.
 *
 * Stage controller (manager) calls this BEFORE invoking the prompt builder
 * (chef) — pure separation of "go to market" from "write recipe". The
 * prompt builder takes the returned data and renders it as a factual
 * section in the prompt; the agent never has to estimate.
 *
 * What we fetch:
 *   1. competitorsDomain(our_domain)   — top 50 SERP-overlap competitors (REQUIRED)
 *   2. backlinksSummary(top 5)         — link profile depth per competitor
 *   3. backlinksAnchors(top 3)         — anchor text patterns
 *   4. onPageInstant(top 5 homepages)  — schema, structure, vitals proxy
 *   5. googleMyBusiness(business)      — IL local presence (single call)
 *
 * Hard-fail strategy (playbook §17):
 *   - PRIMARY data (competitorsDomain) — DfsError bubbles up, stage fails.
 *   - SECONDARY enrichment (backlinks/anchors/onPage/gmb) — best-effort.
 *     Per-competitor failures are logged and skipped; stage continues
 *     with partial enrichment because "missing one optional enrichment"
 *     is different from "no data at all".
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import {
    competitorsDomain,
    backlinksSummary,
    backlinksAnchors,
    backlinksReferringDomains,
    backlinksCompetitors,
    onPageInstant,
    googleMyBusiness,
    googleReviews,
    rankedKeywords,
    searchVolume,
    serpAdvanced,
    parseSerpFeatures,
    LOCATION_IL,
    DfsError,
    type CompetitorsDomainItem,
    type BacklinksSummary,
    type BacklinksAnchorItem,
    type ReferringDomainItem,
    type BacklinksCompetitorItem,
    type OnPageItem,
    type GoogleMyBusinessItem,
    type GoogleReviewItem,
    type RankedKeywordItem,
    type SerpResult,
} from '@/services/research/dataforseo'
import { decideLanguage } from '@/services/research/methodology'
import type { ResearchDataV2 } from '@/services/research/types'

/**
 * Phase E2.1 — per-URL deep snapshot for top-3 ranked URLs of each top-5
 * competitor. Lets the prompt see how their actual money-pages are built
 * (content depth, schema, EEAT signals, structure) instead of inferring
 * from homepage alone.
 */
export interface CompetitorPageSnapshot {
    url: string
    /** Position from rankedKeywords (lower = better SERP rank). */
    rank?: number
    /** What keyword they rank for at this URL */
    rankedFor?: string
    /** Search volume of the keyword they rank for */
    searchVolume?: number
    /** Word count of full text (Firecrawl markdown stripped of YAML/headings). */
    wordCount?: number
    /** Schema @type values found in <script type="application/ld+json"> blocks. */
    schemaTypes: string[]
    /** Heuristic E-E-A-T signals detected on the page. */
    eeatSignals: {
        hasByline: boolean              // "by <author>", or schema.author present
        hasPublishDate: boolean
        hasUpdatedDate: boolean
        hasExternalCitations: boolean   // links to .gov, .edu, news domains
        hasReviews: boolean             // reviews/testimonials section
        authorName?: string
    }
    /** Page structure */
    title?: string
    metaDescription?: string
    h1?: string
    h2List: string[]                    // up to 10
    /** First paragraph of main content (200 chars). */
    firstParagraph?: string
    /** Page type heuristic from URL pattern */
    inferredPageType: string
    /** What went wrong if anything */
    fetchOk: boolean
    fetchError?: string
}

/**
 * Phase E2.5 — per-competitor top keywords for topic-coverage matrix.
 * The model receives this list and synthesizes which clusters/topics each
 * competitor dominates. We capture top 30 by traffic-weighted score so the
 * picture isn't dominated by ultra-low-volume tail.
 */
export interface CompetitorRankedKeyword {
    keyword: string
    rank: number          // SERP position
    volume?: number
    cpc?: number
    url?: string
    /** Estimated traffic from DFS (etv) — best signal for "money keywords" */
    etv?: number
}

/**
 * Phase E2.4 — competitor reviews summary aggregated from DFS google/reviews.
 * Sentiment via heuristic word-list scan (no LLM call) — keeps cost zero
 * after DFS fetch and gives the AI prompt a per-competitor pulse.
 */
export interface CompetitorReviewsSummary {
    /** Total reviews fetched (DFS depth) */
    sample_size: number
    /** Star rating breakdown — 1..5 */
    rating_breakdown: { '1': number; '2': number; '3': number; '4': number; '5': number }
    /** Avg rating across the sample */
    avg_rating: number
    /** % of 4-5 star reviews */
    positive_pct: number
    /** % of 1-2 star reviews */
    negative_pct: number
    /** % of reviews owner has responded to (signals brand engagement) */
    owner_response_rate_pct: number
    /** Top recurring complaint themes (heuristic Hebrew/English keyword scan) */
    top_complaints: string[]
    /** Top recurring praise themes */
    top_praises: string[]
    /** 1-2 representative quotes for negative + positive */
    sample_negative_quote?: string
    sample_positive_quote?: string
}

export interface CompetitorEnrichment {
    domain: string
    /** SERP overlap signal from competitors_domain */
    sharedKeywords: number
    avgPosition: number
    organicCount?: number
    /** Best-effort enrichment — undefined when DFS call failed */
    backlinks?: BacklinksSummary
    anchorPatterns?: BacklinksAnchorItem[]
    onPage?: OnPageItem
    /** Phase E2.1 — top 3 ranked URLs deep-scraped via Firecrawl. */
    deepPages?: CompetitorPageSnapshot[]
    /** Phase E2.4 — Google Business reviews aggregated sentiment (when GMB cid found). */
    reviews?: CompetitorReviewsSummary
    /**
     * Phase 4.0(fix4) — rating + vote count fuzzy-matched from
     * `ourGmb.people_also_search`. Free supplementary signal — present
     * whenever DFS GMB lookup for OUR business included the competitor
     * in its "people also search" panel. Pure rating/count (no text);
     * `reviews` above adds sentiment when googleReviews(cid) succeeds.
     */
    palsRating?: {
        title?: string
        rating?: number
        votes_count?: number
        cid?: string
    }
    /** Phase E2.5 — top 30 ranked keywords for topic-coverage matrix synthesis. */
    topRankedKeywords?: CompetitorRankedKeyword[]
    /** Per-call diagnostics so the prompt can mention "data unavailable" honestly */
    enrichmentMissing: string[]
}

/**
 * Our own backlinks suite (Phase 3.10b). Mirror of CompetitorEnrichment for
 * the OWN domain — gives the prompt a baseline to compare against
 * competitor link profiles + identify link-gap targets to outreach.
 */
export interface OwnLinkProfile {
    summary?: BacklinksSummary
    anchorPatterns?: BacklinksAnchorItem[]
    referringDomains?: ReferringDomainItem[]
    /** Domains linking to competitors but NOT to us — outreach prospect list. */
    linkGapCandidates?: BacklinksCompetitorItem[]
    /** Per-call diagnostics for honest "data unavailable" reporting in prompt. */
    enrichmentMissing: string[]
}

export interface CompetitorLandscapeDfsData {
    /** Our own domain — null if not configured (stage will note this in prompt) */
    ourDomain: string | null
    /** Was competitor data discovered? false ⇒ stage must report no data */
    hasCompetitorData: boolean
    /** Top 50 competitors by SERP overlap. Empty if no website configured. */
    competitors: CompetitorsDomainItem[]
    /** Top 5 enriched with backlinks/anchors/onPage. */
    topEnriched: CompetitorEnrichment[]
    /** Phase 3.10b: our own link profile + link-gap analysis. */
    ourLinks: OwnLinkProfile
    /** Our own GMB profile if found (null if not local business or not registered) */
    ourGmb: GoogleMyBusinessItem | null
    /** Sum DFS USD cost (cache misses only) — for logging */
    totalCostUsd: number
    /** Counts for log line: cached vs fetched fresh */
    cacheHits: number
    cacheMisses: number
    /** Phase E2.1 — was Firecrawl available for deep page scrapes?
     *  When false, deepPages will be empty and prompt notes it. */
    firecrawlAvailable: boolean
    /** Phase E2.1 — count of pages successfully deep-scraped across all competitors */
    firecrawlPagesScraped: number
    /** Phase E2.6 — SERP feature ownership matrix per top-N priority keywords. */
    serpOwnership: SerpOwnershipEntry[]
    /**
     * Phase 4.0 — monthly volume for top head terms (Google Ads search_volume).
     * Drives the "Why now / timing" narrative with REAL seasonality data
     * instead of working-hypothesis claims. Empty array if endpoint failed.
     */
    seasonality: SeasonalityEntry[]
    /**
     * Phase 4.0 — keywords where DFS rankedKeywords says we rank but the live
     * SERP from serpAdvanced did NOT find our domain in top-30. Flags stale
     * index, location/device mismatch, or post-update drops.
     */
    rankingMismatches: RankingMismatch[]
}

/** Phase 4.0 — monthly seasonality for one head term. */
export interface SeasonalityEntry {
    keyword: string
    avg_monthly_volume?: number
    /** Last 12 months in chronological order — {year, month, volume}. */
    monthly: Array<{ year: number; month: number; volume: number }>
    /** Months that exceeded avg by ≥25% — the "peak" window. */
    peak_months: number[]
}

/** Phase 4.0 — single SERP-vs-rankedKeywords inconsistency for our domain. */
export interface RankingMismatch {
    keyword: string
    /** What DFS rankedKeywords reported (lower = better; usually 1..20). */
    dfs_rank?: number
    /** Did serpAdvanced (live, mobile, IL) place us on page 1? */
    live_top30: boolean
    /** Heuristic interpretation, plain Hebrew, for the prompt to surface honestly. */
    interpretation_he: string
}

/**
 * Phase E2.6 — per-keyword SERP feature ownership snapshot. Tells the AI:
 *   "for query X, who currently owns AI Overview / featured snippet / PAA?"
 * Drives strategic decisions like "we can't beat avia2000 organically — but
 * they don't own the featured snippet, that's our wedge".
 */
export interface SerpOwnershipEntry {
    keyword: string
    /** Search volume from upstream rankedKeywords */
    volume?: number
    /** Top 3 organic results (domain only). */
    top_organic: Array<{ rank: number; domain: string; url?: string }>
    /** Who's cited in AI Overview (if present) — domains only */
    ai_overview_cited?: string[]
    /** Domain whose page Google selected for the featured snippet */
    featured_snippet_owner?: string
    /** PAA questions + answer-source domains */
    paa_owners?: Array<{ question: string; answer_domain?: string }>
    /** Other features present (image_pack, local_pack, video_carousel, etc.) */
    other_features: string[]
    /** Did our domain appear anywhere on this SERP? */
    we_present_on_page1?: boolean
}

/**
 * Run the pre-fetch. Throws DfsError on PRIMARY failures (no key, no credits,
 * invalid creds, primary endpoint failure). Caller handles → user-friendly
 * 502 response.
 */
export async function prefetchCompetitorLandscape(
    instanceId: string,
    rd: ResearchDataV2,
    agentId?: string | null,
): Promise<CompetitorLandscapeDfsData> {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const businessName = String(answers.businessName || '')
    const websiteUrl = String(answers.websiteUrl || '').trim()

    // Language decision feeds DFS language_code. Default Hebrew unless the
    // business is clearly global-B2B-tech per the methodology decision tree.
    const lang = decideLanguage({
        business_type: inferBusinessType(answers),
        delivery_locality: inferLocality(answers),
        research_corpus: 'mixed',
        trust_heavy: !!(answers.trustHeavy),
        tech_persona: !!(answers.techPersona),
    })
    const languageCode: 'he' | 'en' = lang.primary === 'en' ? 'en' : 'he'

    let ourDomain: string | null = null
    if (websiteUrl) {
        try {
            const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
            ourDomain = u.hostname.replace(/^www\./, '')
        } catch {
            ourDomain = null
        }
    }

    let totalCostUsd = 0
    let cacheHits = 0
    let cacheMisses = 0
    const trackCall = <T>(r: { cost: number; cached: boolean; items: T[] }) => {
        totalCostUsd += r.cost
        if (r.cached) cacheHits++
        else cacheMisses++
        return r
    }

    // ─── PRIMARY: domain-level competitors. Hard-fail if this errors. ──
    let competitors: CompetitorsDomainItem[] = []
    if (ourDomain) {
        try {
            const r = await competitorsDomain(instanceId, ourDomain, {
                location_code: LOCATION_IL,
                language_code: languageCode,
                limit: 50,
                intersections: 5,
            })
            trackCall(r)
            competitors = r.items
        } catch (err) {
            // Bubble DfsError types we know about — caller maps to user-facing 502
            if (err instanceof DfsError) throw err
            // Unknown errors surface as task_failed equivalent
            throw new DfsError(
                'task_failed',
                `שגיאה בקריאה ל-DataForSEO competitorsDomain: ${(err as Error).message}`,
            )
        }
    }

    // ─── SECONDARY: our own backlinks suite (Phase 3.10b) ──
    // Link profile baseline + anchor distribution + lost-link recovery candidates
    // + link-gap analysis (domains linking to competitors but not us).
    // All best-effort — failures fall through to enrichmentMissing flags.
    const ourLinks: OwnLinkProfile = { enrichmentMissing: [] }
    if (ourDomain) {
        const [oursSum, oursAnch, oursRef, linkGap] = await Promise.allSettled([
            backlinksSummary(instanceId, ourDomain),
            backlinksAnchors(instanceId, ourDomain, { limit: 50 }),
            backlinksReferringDomains(instanceId, ourDomain, { limit: 100, include_lost: true }),
            backlinksCompetitors(instanceId, ourDomain, { limit: 30 }),
        ])
        if (oursSum.status === 'fulfilled') {
            trackCall(oursSum.value)
            ourLinks.summary = oursSum.value.items[0]
        } else {
            ourLinks.enrichmentMissing.push('our_backlinks_summary')
            console.warn(`[prefetch/competitor_landscape] our backlinks summary failed:`, (oursSum.reason as Error).message)
        }
        if (oursAnch.status === 'fulfilled') {
            trackCall(oursAnch.value)
            ourLinks.anchorPatterns = oursAnch.value.items
        } else {
            ourLinks.enrichmentMissing.push('our_backlinks_anchors')
        }
        if (oursRef.status === 'fulfilled') {
            trackCall(oursRef.value)
            ourLinks.referringDomains = oursRef.value.items
        } else {
            ourLinks.enrichmentMissing.push('our_referring_domains')
        }
        if (linkGap.status === 'fulfilled') {
            trackCall(linkGap.value)
            ourLinks.linkGapCandidates = linkGap.value.items
        } else {
            ourLinks.enrichmentMissing.push('link_gap_analysis')
        }
    } else {
        ourLinks.enrichmentMissing.push('no_domain_configured')
    }

    // ─── SECONDARY enrichment: best-effort per competitor ──
    const topNDomains = competitors.slice(0, 5).map(c => c.domain)
    const topEnriched: CompetitorEnrichment[] = []
    for (const domain of topNDomains) {
        const enrich: CompetitorEnrichment = {
            domain,
            sharedKeywords: competitors.find(c => c.domain === domain)?.intersections ?? 0,
            avgPosition: competitors.find(c => c.domain === domain)?.avg_position ?? 0,
            organicCount: competitors.find(c => c.domain === domain)?.full_domain_metrics?.organic?.count,
            enrichmentMissing: [],
        }
        // Run the 3 calls per competitor in parallel. Each is best-effort.
        const [blsRes, ancRes, opRes] = await Promise.allSettled([
            backlinksSummary(instanceId, domain),
            backlinksAnchors(instanceId, domain, { limit: 50 }),
            onPageInstant(instanceId, `https://${domain}`),
        ])
        if (blsRes.status === 'fulfilled') {
            trackCall(blsRes.value)
            enrich.backlinks = blsRes.value.items[0]
        } else {
            enrich.enrichmentMissing.push('backlinks_summary')
            console.warn(`[prefetch/competitor_landscape] backlinks ${domain} failed:`, (blsRes.reason as Error).message)
        }
        if (ancRes.status === 'fulfilled') {
            trackCall(ancRes.value)
            enrich.anchorPatterns = ancRes.value.items
        } else {
            enrich.enrichmentMissing.push('backlinks_anchors')
            console.warn(`[prefetch/competitor_landscape] anchors ${domain} failed:`, (ancRes.reason as Error).message)
        }
        if (opRes.status === 'fulfilled') {
            trackCall(opRes.value)
            enrich.onPage = opRes.value.items[0]
        } else {
            enrich.enrichmentMissing.push('on_page_audit')
            console.warn(`[prefetch/competitor_landscape] onPage ${domain} failed:`, (opRes.reason as Error).message)
        }
        topEnriched.push(enrich)
    }

    // ─── GMB lookup (single call for our business) ──
    let ourGmb: GoogleMyBusinessItem | null = null
    if (businessName) {
        try {
            const r = await googleMyBusiness(instanceId, businessName, {
                location_code: LOCATION_IL,
                language_code: languageCode,
            })
            trackCall(r)
            ourGmb = r.items[0] || null
        } catch (err) {
            console.warn(`[prefetch/competitor_landscape] GMB lookup failed:`, (err as Error).message)
            // GMB failure is non-fatal — many businesses aren't in GBP
        }
    }

    // ─── Phase E2.1 — deep page snapshots per top-5 competitor ──
    // Strategy: pull each competitor's top-3 ranked URLs via DFS rankedKeywords
    // (their actual money-pages) and Firecrawl-scrape each. The prompt now
    // sees real content depth + schema across page-types + EEAT signals,
    // not just the homepage. Single-page competitor audits chronically miss
    // EEAT and content depth — those live on inner pages.
    //
    // Best-effort throughout:
    //   - No firecrawlKey → skip entirely; firecrawlAvailable=false
    //   - rankedKeywords fails for a competitor → enrichmentMissing.push, continue
    //   - Per-URL Firecrawl fail → snapshot.fetchOk=false, continue
    let firecrawlAvailable = false
    let firecrawlPagesScraped = 0
    try {
        // Per-agent firecrawl key (secondary brands may bring their own);
        // fall back to the instance/primary key.
        let firecrawlKey: string | null = null
        if (agentId) {
            const { resolveAgentById } = await import('@/services/agentContext')
            const ag = await resolveAgentById(instanceId, agentId)
            firecrawlKey = (ag as { firecrawlKey?: string } | null)?.firecrawlKey || null
        }
        if (!firecrawlKey) {
            const [inst] = await db.select({ firecrawlKey: instances.firecrawlKey })
                .from(instances).where(eq(instances.id, instanceId))
            firecrawlKey = inst?.firecrawlKey || null
        }
        if (firecrawlKey) {
            firecrawlAvailable = true
            for (const enrich of topEnriched) {
                const result = await fetchDeepPagesForCompetitor(
                    instanceId, enrich.domain, firecrawlKey, languageCode, trackCall,
                )
                // Phase E2.5 — capture topic-matrix signal even if deep
                // Firecrawl scrapes failed (rankedKeywords succeeded earlier).
                if (result.topRankedKeywords.length > 0) {
                    enrich.topRankedKeywords = result.topRankedKeywords
                }
                if (result.deepPages.length > 0) {
                    enrich.deepPages = result.deepPages
                    firecrawlPagesScraped += result.deepPages.filter(p => p.fetchOk).length
                } else {
                    enrich.enrichmentMissing.push('deep_pages_unavailable')
                }
            }
        } else {
            // No Firecrawl — still grab rankedKeywords for topic matrix
            for (const enrich of topEnriched) {
                enrich.enrichmentMissing.push('firecrawl_key_not_configured')
                try {
                    const r = await rankedKeywords(instanceId, enrich.domain, {
                        location_code: LOCATION_IL,
                        language_code: languageCode,
                        limit: 100,
                        filters: [['ranked_serp_element.serp_item.rank_absolute', '<=', 20]],
                    })
                    trackCall(r)
                    enrich.topRankedKeywords = r.items
                        .map(i => ({
                            keyword: i.keyword_data?.keyword || '',
                            rank: i.ranked_serp_element?.serp_item?.rank_absolute ?? 99,
                            volume: i.keyword_data?.keyword_info?.search_volume ?? undefined,
                            cpc: i.keyword_data?.keyword_info?.cpc ?? undefined,
                            url: i.ranked_serp_element?.serp_item?.url,
                            etv: (i.ranked_serp_element?.serp_item as Record<string, unknown> | undefined)?.etv as number | undefined,
                        }))
                        .filter(k => k.keyword && k.rank <= 20)
                        .sort((a, b) => (b.etv || 0) - (a.etv || 0))
                        .slice(0, 30)
                } catch (err) {
                    console.warn(`[prefetch/competitor_landscape] rankedKeywords (no-firecrawl path) ${enrich.domain} failed:`, (err as Error).message)
                }
            }
            console.warn(`[prefetch/competitor_landscape] firecrawlKey not configured — skipping deep page scrapes`)
        }
    } catch (err) {
        console.warn(`[prefetch/competitor_landscape] deep page fetch loop error:`, (err as Error).message)
    }

    // ─── Phase 4.0(fix4) — extract competitor ratings from ourGmb.people_also_search ──
    // DFS' googleMyBusiness response for OUR business includes a
    // `people_also_search` array of related local-pack entries (4 here for
    // Packing Station: GET PACKING 4.8/1030, Moving Station 5/6, etc).
    // Free supplementary data — no extra call. Used as a baseline rating
    // signal for any top-enriched competitor whose name fuzzy-matches an
    // entry. Per-competitor `googleReviews(cid)` (next block) is still
    // attempted for sentiment, but this block guarantees that rating +
    // sample_size land on the record even if the reviews call fails.
    type PalsEntry = { title?: string; cid?: string; rating?: { value?: number; votes_count?: number } }
    const palsRaw = (ourGmb as { people_also_search?: unknown } | null)?.people_also_search
    const pals: PalsEntry[] = Array.isArray(palsRaw) ? (palsRaw as PalsEntry[]) : []
    if (pals.length > 0) {
        console.log(`[prefetch/competitor_landscape] ourGmb.people_also_search → ${pals.length} entries: ${pals.map(p => `${p.title}(${p.rating?.votes_count}r)`).join(', ')}`)
    }
    // Normalise for fuzzy matching: strip whitespace + punctuation, lower-case
    // Latin parts, keep Hebrew. Pals titles are LONG: "קרטונים וחומרי אריזה
    // למעבר דירה - Shop GetMoving" — the substring with Latin brand is what
    // matches against domain SLD like "getmoving".
    const normalise = (s: string) => (s || '').toLowerCase().replace(/[\s\-_.,|·–—:'"()/]+/g, '')
    // English brand tokens common in IL store names. If domain SLD contains
    // any of these as a sub-stem ("getpacking" → ["get","packing"]) it's
    // unlikely to be a single contiguous English word in a Hebrew title,
    // so we also split the SLD by camelCase + common boundaries for
    // partial-word matching.
    const splitStem = (sld: string): string[] => {
        // camelCase split: "getMoving" → ["get","moving"]; "bestbox" stays whole.
        const parts = sld.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_]+/).filter(Boolean)
        return parts.length > 1 ? parts : [sld.toLowerCase()]
    }
    for (const enrich of topEnriched) {
        const sld = enrich.domain.split('.')[0]
        const wantWhole = normalise(sld)
        const wantParts = splitStem(sld).map(normalise)
        const match = pals.find(p => {
            const t = normalise(p.title || '')
            if (!t) return false
            // Strong match: whole SLD appears as substring.
            if (t.includes(wantWhole)) return true
            // Multi-word SLD: require ALL parts present (e.g. "get" AND
            // "moving" in "shopgetmoving"). Avoids false positives where
            // only generic word matches ("packing" in everything).
            if (wantParts.length > 1 && wantParts.every(p => p.length >= 3 && t.includes(p))) return true
            // Last resort — palsTitle is short enough to be the brand alone.
            return wantWhole.includes(t.slice(0, 5)) && t.length <= 25
        })
        if (match && match.rating && (match.rating.votes_count || 0) > 0) {
            // Pre-populate from the freebie. googleReviews(cid) below MAY
            // upgrade this with theme/sentiment text. If that fails we
            // still have the rating + count.
            enrich.palsRating = {
                title: match.title,
                rating: match.rating.value,
                votes_count: match.rating.votes_count,
                cid: typeof match.cid === 'string' ? match.cid : undefined,
            }
        }
    }
    const palsMatchedCount = topEnriched.filter(e => e.palsRating).length
    if (pals.length > 0) {
        console.log(`[prefetch/competitor_landscape] palsRating matched ${palsMatchedCount}/${topEnriched.length} competitors`)
    }

    // ─── Phase E2.4 — Google Business reviews per top-5 competitor ──
    // For each competitor, look up GMB → if cid available → fetch up to 50
    // reviews → aggregate sentiment heuristically.
    //
    // Phase 4.0(fix2): GMB matches business NAMES, not domains. Strategy:
    // try multiple search strings until one returns a cid.
    //   1. Derived business name from onPage title / deepPages title.
    //   2. Domain SLD (e.g. "getpacking" from "getpacking.co.il") — many
    //      Israeli stores' GMB names match their domain stem.
    //   3. Bare domain — last resort, often 0 results, but free to try.
    // Stops at the first hit. Empty results push specific markers to
    // enrichmentMissing so the prompt can attribute "data_unavailable"
    // honestly. Skip domains that aren't real businesses (facebook.com,
    // wikipedia.org) — checked against COMMON_PLATFORM_DOMAINS.
    let reviewsFetchedCount = 0
    const COMMON_PLATFORM_DOMAINS = new Set([
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com',
        'tiktok.com', 'wikipedia.org', 'pinterest.com', 'linkedin.com',
        'reddit.com', 'amazon.com', 'aliexpress.com', 'ebay.com',
    ])
    for (const enrich of topEnriched) {
        const baseDomain = enrich.domain.toLowerCase().replace(/^www\./, '')
        if (COMMON_PLATFORM_DOMAINS.has(baseDomain) || COMMON_PLATFORM_DOMAINS.has(baseDomain.split('.').slice(-2).join('.'))) {
            enrich.enrichmentMissing.push('gmb_skip_platform_domain')
            continue
        }
        const candidates: string[] = []
        const derivedName = deriveBusinessNameFromEnrichment(enrich)
        if (derivedName) candidates.push(derivedName)
        // SLD: getpacking.co.il → "getpacking"
        const sld = baseDomain.split('.')[0]
        if (sld && sld.length >= 3 && !candidates.includes(sld)) candidates.push(sld)
        if (!candidates.includes(baseDomain)) candidates.push(baseDomain)

        let cid: string | null = null
        let matchedTitle: string | null = null
        let usedKeyword: string | null = null
        const triedKeywords: string[] = []
        // Phase 4.0(fix4) — seed candidate list with people_also_search title
        // (already known to be a real GMB-registered business in our market).
        if (enrich.palsRating?.title && !candidates.includes(enrich.palsRating.title)) {
            candidates.unshift(enrich.palsRating.title)
        }
        for (const kw of candidates) {
            triedKeywords.push(kw)
            try {
                const gmbRes = await googleMyBusiness(instanceId, kw, {
                    location_code: LOCATION_IL,
                    language_code: languageCode,
                })
                trackCall(gmbRes)
                const found = gmbRes.items[0]
                if (found?.cid) {
                    cid = found.cid
                    matchedTitle = found.title || null
                    usedKeyword = kw
                    break
                }
            } catch (err) {
                console.warn(`[prefetch/competitor_landscape] GMB lookup "${kw}" failed:`, (err as Error).message)
            }
        }

        // If direct lookup didn't find a cid but people_also_search did,
        // adopt that one — saves a competitor whose name doesn't match
        // our SLD heuristic ("הכל למוביל" vs "hakol-lamovil").
        if (!cid && enrich.palsRating?.cid) {
            cid = enrich.palsRating.cid
            matchedTitle = enrich.palsRating.title || null
            usedKeyword = `pals:${enrich.palsRating.title}`
        }

        if (!cid) {
            enrich.enrichmentMissing.push(`gmb_not_found(tried:${triedKeywords.join('|')})`)
            continue
        }
        console.log(`[prefetch/competitor_landscape] GMB matched ${baseDomain} via "${usedKeyword}" (cid=${cid}, title="${matchedTitle}")`)
        // Phase 4.0(fix4) — DFS's google_reviews endpoint historically 404'd
        // when fed a CID directly (despite the docs claim that CID works as
        // `keyword`). Empirically business name + location code is the path
        // that actually returns reviews. Try title first (real signal),
        // fall back to cid only as a last resort.
        const reviewsAttempts: Array<{ key: string; label: string }> = []
        if (matchedTitle) reviewsAttempts.push({ key: matchedTitle, label: 'title' })
        reviewsAttempts.push({ key: cid, label: 'cid' })

        let reviewsLoaded = false
        for (const attempt of reviewsAttempts) {
            try {
                const revRes = await googleReviews(instanceId, attempt.key, {
                    limit: 50,
                    sortBy: 'newest',
                    location_code: LOCATION_IL,
                    language_code: languageCode,
                })
                trackCall(revRes)
                if (revRes.items.length > 0) {
                    enrich.reviews = aggregateReviews(revRes.items)
                    reviewsFetchedCount += revRes.items.length
                    reviewsLoaded = true
                    console.log(`[prefetch/competitor_landscape] reviews matched ${baseDomain} via ${attempt.label}="${attempt.key.slice(0, 40)}" (${revRes.items.length} reviews)`)
                    break
                }
            } catch (err) {
                console.warn(`[prefetch/competitor_landscape] reviews via ${attempt.label}="${attempt.key.slice(0, 40)}" failed:`, (err as Error).message)
            }
        }
        if (!reviewsLoaded) {
            enrich.enrichmentMissing.push('reviews_fetch_failed_all_strategies')
        }
    }

    // ─── Phase E2.6 — SERP feature ownership matrix ──
    // For top 5-7 priority keywords, get the live SERP and aggregate:
    //   - who owns AI Overview (cited_links domains)
    //   - who owns the featured snippet (organic position #1 if FS-flagged)
    //   - who owns PAA answer slots (domain of each PAA answer)
    //   - whether OUR domain is anywhere on page 1
    //
    // Priority keyword selection: top 7 by intersection × volume from
    // competitorsDomain. We approximate volume via the etv-weighted average
    // from competitor topRankedKeywords (already loaded above) — close enough.
    //
    // Cost: 7 SERP calls × ~$0.04 = $0.28 added on cache miss; cache hit on
    // re-run free. Worth it: SERP ownership is the single most actionable
    // strategic signal an SEO needs.
    const serpOwnership: SerpOwnershipEntry[] = []
    try {
        const priorityKeywordCandidates = pickPriorityKeywordsForSerp(topEnriched)
        if (priorityKeywordCandidates.length > 0) {
            for (const kw of priorityKeywordCandidates.slice(0, 7)) {
                try {
                    const serp = await serpAdvanced(instanceId, kw.keyword, {
                        location_code: LOCATION_IL,
                        language_code: languageCode,
                        device: 'mobile',
                        depth: 30,
                    })
                    trackCall(serp)
                    const item = serp.items[0]
                    if (item) serpOwnership.push(buildSerpOwnership(kw, item, ourDomain))
                } catch (err) {
                    console.warn(`[prefetch/competitor_landscape] serpAdvanced "${kw.keyword}" failed:`, (err as Error).message)
                }
            }
        }
    } catch (err) {
        console.warn(`[prefetch/competitor_landscape] SERP ownership loop error:`, (err as Error).message)
    }

    // ─── Phase 4.0 — Seasonality for top head terms ──
    // For the "Why now / timing" narrative we used to ask the LLM to guess
    // peak months (got: "probably June-August" labeled medium confidence).
    // DFS searchVolume includes 12 months of monthly_searches at no extra
    // cost — just need to call it for the right head terms. Pick the top 5
    // by score from the SERP-priority candidate list (already ranked by
    // intersection × volume), so we model the busiest, most-contested keys.
    const seasonality: SeasonalityEntry[] = []
    try {
        const headTerms = pickPriorityKeywordsForSerp(topEnriched).slice(0, 5).map(k => k.keyword)
        if (headTerms.length > 0) {
            const svRes = await searchVolume(instanceId, headTerms, {
                location_code: LOCATION_IL,
                language_code: languageCode,
            })
            trackCall(svRes)
            for (const item of svRes.items) {
                const monthly = (item.monthly_searches || []).map(m => ({
                    year: m.year, month: m.month, volume: m.search_volume,
                }))
                if (monthly.length === 0) continue
                const avg = monthly.reduce((s, m) => s + m.volume, 0) / monthly.length
                const peak_months = monthly
                    .filter(m => m.volume >= avg * 1.25)
                    .map(m => m.month)
                seasonality.push({
                    keyword: item.keyword,
                    avg_monthly_volume: Math.round(avg),
                    monthly,
                    peak_months: Array.from(new Set(peak_months)).sort((a, b) => a - b),
                })
            }
        }
    } catch (err) {
        console.warn(`[prefetch/competitor_landscape] seasonality fetch failed:`, (err as Error).message)
    }

    // ─── Phase 4.0 — Cross-validation: rankedKeywords vs serpAdvanced ──
    // For each keyword where serpAdvanced ran AND our domain is supposed
    // to rank per DFS rankedKeywords, check whether the live SERP actually
    // includes us on page 1. Mismatch ⇒ flag to prompt (stale index? sandbox
    // pull? recent drop?). The model will surface this honestly instead of
    // pretending DFS rank is gospel.
    const rankingMismatches: RankingMismatch[] = []
    if (ourDomain) {
        // Build a quick lookup of (keyword → our DFS rank) using the top-N
        // ranked keywords that the prefetch loaded for our own domain. We
        // already grabbed those when running serpOwnership inputs, but only
        // for competitors. Run a single ranked_keywords pass on OUR domain
        // to know where DFS thinks we rank for head terms.
        try {
            const oursRk = await rankedKeywords(instanceId, ourDomain, {
                location_code: LOCATION_IL,
                language_code: languageCode,
                limit: 100,
                filters: [['ranked_serp_element.serp_item.rank_absolute', '<=', 20]],
            })
            trackCall(oursRk)
            const ourDfsRanks = new Map<string, number>()
            for (const r of oursRk.items) {
                const kw = r.keyword_data?.keyword?.toLowerCase().trim()
                const rank = r.ranked_serp_element?.serp_item?.rank_absolute
                if (kw && typeof rank === 'number') ourDfsRanks.set(kw, rank)
            }
            for (const entry of serpOwnership) {
                const kw = entry.keyword.toLowerCase().trim()
                const dfsRank = ourDfsRanks.get(kw)
                // Only flag if DFS says we rank well (≤20) but the live SERP
                // didn't see us. Without a DFS rank there's no "mismatch".
                if (dfsRank != null && dfsRank <= 20 && !entry.we_present_on_page1) {
                    rankingMismatches.push({
                        keyword: entry.keyword,
                        dfs_rank: dfsRank,
                        live_top30: false,
                        interpretation_he: `DFS rankedKeywords אומר שאנחנו #${dfsRank}, אבל serpAdvanced (mobile, IL, ${new Date().toISOString().slice(0, 10)}) לא מצא את הדומיין בעמוד 1 (top 30). סיבות אפשריות: index stale ב-DFS · ירידה לאחרונה · personalization/locale shift · mobile vs desktop · canonicalization. **אל תציגו את ה-DFS rank כאמת חד-משמעית — דווחו על הסתירה.**`,
                    })
                }
            }
        } catch (err) {
            console.warn(`[prefetch/competitor_landscape] cross-validation rankedKeywords failed:`, (err as Error).message)
        }
    }

    console.log(`[prefetch/competitor_landscape] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} hit-rate competitors=${competitors.length} enriched=${topEnriched.length} deep_pages=${firecrawlPagesScraped} reviews=${reviewsFetchedCount} serp_ownership=${serpOwnership.length} seasonality=${seasonality.length} ranking_mismatches=${rankingMismatches.length}`)

    return {
        ourDomain,
        hasCompetitorData: competitors.length > 0,
        competitors,
        topEnriched,
        ourLinks,
        ourGmb,
        totalCostUsd,
        cacheHits,
        cacheMisses,
        firecrawlAvailable,
        firecrawlPagesScraped,
        serpOwnership,
        seasonality,
        rankingMismatches,
    }
}

// ─── Phase E2.1 helpers ─────────────────────────────────────────────────────

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape'

interface FirecrawlScrapeResponse {
    success?: boolean
    data?: {
        markdown?: string
        html?: string
        metadata?: {
            title?: string
            description?: string
            language?: string
        }
    }
    error?: string
}

type TrackCallFn = <T>(r: { cost: number; cached: boolean; items: T[] }) => { cost: number; cached: boolean; items: T[] }

async function fetchDeepPagesForCompetitor(
    instanceId: string,
    domain: string,
    firecrawlKey: string,
    languageCode: 'he' | 'en',
    trackCall: TrackCallFn,
): Promise<{ deepPages: CompetitorPageSnapshot[]; topRankedKeywords: CompetitorRankedKeyword[] }> {
    // 1. Identify top URLs by SERP rank — money-pages signal.
    //    Phase E2.5 — bumped limit 50→100 so we capture richer topic-matrix
    //    signal in addition to the 3 deep-scraped URLs.
    let topRanked: RankedKeywordItem[] = []
    try {
        const r = await rankedKeywords(instanceId, domain, {
            location_code: LOCATION_IL,
            language_code: languageCode,
            limit: 100,
            filters: [
                ['ranked_serp_element.serp_item.rank_absolute', '<=', 20],
            ],
        })
        trackCall(r)
        topRanked = r.items
    } catch (err) {
        console.warn(`[prefetch/competitor_landscape] rankedKeywords ${domain} failed:`, (err as Error).message)
        return { deepPages: [], topRankedKeywords: [] }
    }

    // Phase E2.5 — synthesize topic-matrix signal: top 30 by etv (estimated
    // traffic value) which weights high-volume + good-position pages.
    const topRankedKeywords: CompetitorRankedKeyword[] = topRanked
        .map(r => ({
            keyword: r.keyword_data?.keyword || '',
            rank: r.ranked_serp_element?.serp_item?.rank_absolute ?? 99,
            volume: r.keyword_data?.keyword_info?.search_volume ?? undefined,
            cpc: r.keyword_data?.keyword_info?.cpc ?? undefined,
            url: r.ranked_serp_element?.serp_item?.url,
            etv: (r.ranked_serp_element?.serp_item as Record<string, unknown> | undefined)?.etv as number | undefined,
        }))
        .filter(k => k.keyword && k.rank <= 20)
        .sort((a, b) => (b.etv || 0) - (a.etv || 0))
        .slice(0, 30)

    // Pick distinct URLs ranked best (lowest rank_absolute), prefer non-homepage
    // diversity — homepage already audited via onPageInstant elsewhere.
    const seenUrls = new Set<string>()
    const urlPriority: Array<{ url: string; rank: number; keyword: string; volume: number }> = []
    for (const r of topRanked) {
        const url = r.ranked_serp_element?.serp_item?.url
        const rank = r.ranked_serp_element?.serp_item?.rank_absolute
        const keyword = r.keyword_data?.keyword
        const volume = r.keyword_data?.keyword_info?.search_volume
        if (!url || rank == null || !keyword) continue
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
        urlPriority.push({ url, rank, keyword, volume: volume ?? 0 })
    }
    urlPriority.sort((a, b) => a.rank - b.rank)
    // Skip the bare homepage in favor of inner pages — onPageInstant already
    // covered it. Re-add homepage only if we have <3 inner candidates.
    const isBareHome = (u: string) => {
        try {
            const url = new URL(u)
            return !url.pathname || url.pathname === '/' || url.pathname === ''
        } catch { return false }
    }
    let chosen = urlPriority.filter(u => !isBareHome(u.url)).slice(0, 3)
    if (chosen.length < 3) {
        const home = urlPriority.find(u => isBareHome(u.url))
        if (home && !chosen.find(c => c.url === home.url)) chosen = [home, ...chosen].slice(0, 3)
    }

    if (chosen.length === 0) return { deepPages: [], topRankedKeywords }

    // 2. Firecrawl scrape each in parallel.
    const snapshots = await Promise.all(chosen.map(async (c): Promise<CompetitorPageSnapshot> => {
        try {
            const res = await fetch(FIRECRAWL_API, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: c.url,
                    formats: ['markdown', 'html'],
                    onlyMainContent: true,
                }),
                signal: AbortSignal.timeout(60_000),
            })
            if (!res.ok) {
                return buildEmptySnapshot(c.url, c.rank, c.keyword, c.volume, `firecrawl_http_${res.status}`)
            }
            const body = await res.json() as FirecrawlScrapeResponse
            if (!body.success || !body.data) {
                return buildEmptySnapshot(c.url, c.rank, c.keyword, c.volume, body.error || 'firecrawl_no_data')
            }
            return analyzeScrapedPage(c.url, c.rank, c.keyword, c.volume, body.data)
        } catch (err) {
            return buildEmptySnapshot(c.url, c.rank, c.keyword, c.volume, (err as Error).message)
        }
    }))

    return { deepPages: snapshots, topRankedKeywords }
}

function buildEmptySnapshot(
    url: string, rank: number, rankedFor: string, searchVolume: number, error: string,
): CompetitorPageSnapshot {
    return {
        url, rank, rankedFor, searchVolume,
        schemaTypes: [],
        eeatSignals: { hasByline: false, hasPublishDate: false, hasUpdatedDate: false, hasExternalCitations: false, hasReviews: false },
        h2List: [],
        inferredPageType: inferCompetitorPageType(url),
        fetchOk: false,
        fetchError: error,
    }
}

function analyzeScrapedPage(
    url: string,
    rank: number,
    rankedFor: string,
    searchVolume: number,
    data: NonNullable<FirecrawlScrapeResponse['data']>,
): CompetitorPageSnapshot {
    const html = data.html || ''
    const markdown = data.markdown || ''

    // Schema types from <script type="application/ld+json">
    const schemaTypes: string[] = []
    const ldJsonRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m: RegExpExecArray | null
    while ((m = ldJsonRegex.exec(html)) !== null) {
        try {
            const parsed = JSON.parse(m[1].trim())
            collectSchemaTypes(parsed, schemaTypes)
        } catch { /* invalid LD-JSON; skip */ }
    }

    // H1, H2 from markdown (Firecrawl emits ATX headings)
    const lines = markdown.split('\n')
    let h1: string | undefined
    const h2List: string[] = []
    for (const line of lines) {
        const trimmed = line.trim()
        if (!h1 && /^#\s+(.+)/.test(trimmed)) {
            h1 = trimmed.replace(/^#\s+/, '').trim()
        } else if (/^##\s+(.+)/.test(trimmed)) {
            h2List.push(trimmed.replace(/^##\s+/, '').trim())
            if (h2List.length >= 10) break
        }
    }

    // Word count from full markdown stripped of formatting
    const cleanText = markdown
        .replace(/```[\s\S]*?```/g, '')        // code fences
        .replace(/!?\[[^\]]*\]\([^)]+\)/g, '') // links + images
        .replace(/^[#>*\-+|]+\s*/gm, '')        // markdown structure chars
        .replace(/[*_`~]/g, '')
    const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length

    // First paragraph (skip heading/blank lines)
    let firstParagraph: string | undefined
    for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        if (t.startsWith('#')) continue
        if (t.startsWith('>')) continue
        if (t.startsWith('|')) continue
        firstParagraph = t.substring(0, 250)
        break
    }

    // E-E-A-T signals — heuristic detection from markdown + html
    const eeatSignals = detectEeatSignals(markdown, html)

    // Schema author override
    if (!eeatSignals.authorName) {
        const authorFromSchema = extractAuthorFromSchemas(html)
        if (authorFromSchema) {
            eeatSignals.authorName = authorFromSchema
            eeatSignals.hasByline = true
        }
    }

    return {
        url,
        rank,
        rankedFor,
        searchVolume,
        wordCount,
        schemaTypes: Array.from(new Set(schemaTypes)),
        eeatSignals,
        title: data.metadata?.title?.trim(),
        metaDescription: data.metadata?.description?.trim(),
        h1,
        h2List,
        firstParagraph,
        inferredPageType: inferCompetitorPageType(url),
        fetchOk: true,
    }
}

function collectSchemaTypes(node: unknown, out: string[]): void {
    if (!node) return
    if (Array.isArray(node)) {
        for (const item of node) collectSchemaTypes(item, out)
        return
    }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const type = obj['@type']
    if (typeof type === 'string') out.push(type)
    else if (Array.isArray(type)) {
        for (const t of type) if (typeof t === 'string') out.push(t)
    }
    // Recurse into @graph and other nested structures
    const graph = obj['@graph']
    if (Array.isArray(graph)) {
        for (const item of graph) collectSchemaTypes(item, out)
    }
}

function extractAuthorFromSchemas(html: string): string | undefined {
    const ldJsonRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m: RegExpExecArray | null
    while ((m = ldJsonRegex.exec(html)) !== null) {
        try {
            const parsed = JSON.parse(m[1].trim()) as Record<string, unknown>
            const author = parsed.author
            if (typeof author === 'string') return author
            if (author && typeof author === 'object') {
                const name = (author as Record<string, unknown>).name
                if (typeof name === 'string') return name
            }
        } catch { /* skip */ }
    }
    return undefined
}

function detectEeatSignals(markdown: string, html: string): CompetitorPageSnapshot['eeatSignals'] {
    const m = markdown.toLowerCase()
    const h = html.toLowerCase()
    // Byline patterns: "by John Doe", "כתב/ה: ...", "מאת ..."
    const bylineMatch = markdown.match(/(?:^|\n)\s*(?:by|written by|כתב|כתבה|מאת|נכתב על ידי)\s+([\p{L}\p{M} .']{2,60})/iu)
    const hasByline = !!bylineMatch
    const authorName = bylineMatch ? bylineMatch[1].trim() : undefined

    // Date patterns
    const datePattern = /\b(?:20[0-9]{2})[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12][0-9]|3[01])\b|\b(?:0?[1-9]|[12][0-9]|3[01])[-./](?:0?[1-9]|1[0-2])[-./](?:20[0-9]{2})\b/
    const hasPublishDate = datePattern.test(markdown) || /datepublished|published[-_]?on/i.test(html)
    const hasUpdatedDate = /updated|מעודכן|עודכן|datemodified/i.test(m + ' ' + h)

    // External authority citations
    const externalAuthorityRegex = /https?:\/\/[^\s)"'<>]+\.(?:gov|edu|gov\.il|ac\.il)|https?:\/\/(?:www\.)?(?:nytimes|wsj|forbes|bbc|reuters|calcalist|globes|themarker|ynet|geektime|haaretz)\.[a-z.]+/gi
    const hasExternalCitations = externalAuthorityRegex.test(html)

    // Reviews / testimonials
    const hasReviews = /\bביקור(?:ות|ת)\b|\bהמלצ(?:ות|ה)\b|\btestimonial|\breview/i.test(m)
        || /aggregaterating|review/i.test(h)

    return {
        hasByline,
        hasPublishDate,
        hasUpdatedDate,
        hasExternalCitations,
        hasReviews,
        authorName,
    }
}

function inferCompetitorPageType(url: string): string {
    try {
        const u = new URL(url)
        const path = u.pathname.toLowerCase().replace(/\/$/, '')
        if (!path || path === '') return 'homepage'
        if (/\/blog\/|\/articles\/|\/posts\/|\/news\//.test(path)) return 'blog_post'
        if (/\/about|\/אודות/.test(path)) return 'about'
        if (/\/contact|\/צור-קשר/.test(path)) return 'contact'
        if (/\/pricing|\/מחיר/.test(path)) return 'pricing'
        if (/\/faq|\/שאלות/.test(path)) return 'faq'
        if (/\/products?\/|\/מוצר\//.test(path)) return 'product'
        if (/\/services?\/|\/שירות\//.test(path)) return 'service'
        if (/\/category|\/קטגוריה/.test(path)) return 'category'
        if (/\/locations?\/|\/branches?\/|\/storage\//.test(path)) return 'local_page'
    } catch { /* fallthrough */ }
    return 'other'
}

// ─── Phase E2.6 — SERP feature ownership helpers ──────────────────────────

/**
 * Pick top priority keywords for SERP-ownership analysis. Strategy:
 *   - Aggregate keywords across all top-5 competitors' topRankedKeywords
 *   - Score = sum(etv) × intersection_count (how many competitors rank for it)
 *   - Returns top candidates by combined score, deduped by keyword string
 */
function pickPriorityKeywordsForSerp(
    enriched: CompetitorEnrichment[],
): Array<{ keyword: string; volume?: number }> {
    const scoreMap = new Map<string, { score: number; volume?: number; intersections: number }>()
    for (const e of enriched) {
        for (const kw of e.topRankedKeywords || []) {
            const k = kw.keyword.toLowerCase().trim()
            if (!k) continue
            const prev = scoreMap.get(k) || { score: 0, volume: kw.volume, intersections: 0 }
            const etv = kw.etv ?? 0
            const volBoost = (kw.volume ?? 100) / 100  // normalize so volume contributes
            scoreMap.set(k, {
                score: prev.score + etv + volBoost,
                volume: prev.volume ?? kw.volume,
                intersections: prev.intersections + 1,
            })
        }
    }
    // Prefer keywords ranked by 2+ competitors (truly contested SERPs).
    const sorted = Array.from(scoreMap.entries())
        .sort((a, b) => {
            // Multi-competitor first, then by score
            if (a[1].intersections >= 2 && b[1].intersections < 2) return -1
            if (b[1].intersections >= 2 && a[1].intersections < 2) return 1
            return b[1].score - a[1].score
        })
        .slice(0, 10)
    return sorted.map(([keyword, v]) => ({ keyword, volume: v.volume }))
}

function buildSerpOwnership(
    kw: { keyword: string; volume?: number },
    serp: SerpResult,
    ourDomain: string | null,
): SerpOwnershipEntry {
    const features = parseSerpFeatures(serp)
    const items = (serp.items || []) as Array<Record<string, unknown>>
    const top_organic: SerpOwnershipEntry['top_organic'] = []
    const paa_owners: SerpOwnershipEntry['paa_owners'] = []
    const otherFeatures: string[] = []
    let featuredSnippetOwner: string | undefined
    let aiOverviewCited: string[] | undefined
    let wePresent = false

    let organicRank = 0
    for (const it of items) {
        const itemType = String(it.type || '')
        const url = typeof it.url === 'string' ? it.url : undefined
        const domain = typeof it.domain === 'string'
            ? it.domain.replace(/^www\./, '')
            : (url ? safeHost(url) : undefined)

        if (itemType === 'organic') {
            organicRank++
            if (top_organic.length < 3 && domain) {
                top_organic.push({ rank: organicRank, domain, url })
            }
            if (ourDomain && domain && domain.toLowerCase().includes(ourDomain.toLowerCase())) {
                wePresent = true
            }
        } else if (itemType === 'featured_snippet' && domain) {
            featuredSnippetOwner = domain
        } else if (itemType === 'ai_overview') {
            const refs = it.references as unknown
            if (Array.isArray(refs)) {
                aiOverviewCited = refs
                    .map(r => {
                        if (!r || typeof r !== 'object') return null
                        const rObj = r as Record<string, unknown>
                        const rUrl = typeof rObj.url === 'string' ? rObj.url : undefined
                        return rUrl ? safeHost(rUrl) : null
                    })
                    .filter((d): d is string => !!d)
            }
        } else if (itemType === 'people_also_ask') {
            const paaItems = it.items as unknown
            if (Array.isArray(paaItems)) {
                for (const paa of paaItems.slice(0, 4)) {
                    if (!paa || typeof paa !== 'object') continue
                    const paaObj = paa as Record<string, unknown>
                    const question = typeof paaObj.title === 'string' ? paaObj.title : ''
                    if (!question) continue
                    const expanded = paaObj.expanded_element as Array<{ url?: string }> | undefined
                    const answerUrl = expanded?.[0]?.url
                    paa_owners.push({
                        question,
                        answer_domain: answerUrl ? safeHost(answerUrl) : undefined,
                    })
                }
            }
        } else if (itemType === 'video' || itemType === 'video_carousel'
                || itemType === 'images' || itemType === 'image_pack'
                || itemType === 'shopping_carousel' || itemType === 'local_pack'
                || itemType === 'twitter') {
            otherFeatures.push(itemType)
        }
    }

    return {
        keyword: kw.keyword,
        volume: kw.volume,
        top_organic,
        ai_overview_cited: aiOverviewCited,
        featured_snippet_owner: featuredSnippetOwner ?? (features.has_featured_snippet ? top_organic[0]?.domain : undefined),
        paa_owners: paa_owners.length > 0 ? paa_owners : undefined,
        other_features: Array.from(new Set(otherFeatures)),
        we_present_on_page1: wePresent,
    }
}

function safeHost(u: string): string | undefined {
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return undefined }
}

// ─── Phase E2.4 — review aggregation ───────────────────────────────────────
// Heuristic sentiment + theme extraction. Bilingual (he+en) keyword lists
// for the SMB IL market — works across most B2C verticals (storage,
// hospitality, services). Purposefully simple: no LLM call, runs in <50ms
// on a 50-review sample. The prompt downstream does the nuanced reading.

const REVIEW_COMPLAINT_KEYWORDS: Record<string, RegExp> = {
    'מחיר/יוקר': /\b(?:יקר|מחיר גבוה|לא משתלם|expensive|overpriced|costly)\b/i,
    'איכות שירות': /\b(?:שירות גרוע|לא אדיב|גס|חצוף|rude|poor service|unprofessional)\b/i,
    'זמני המתנה': /\b(?:איחור|המתנה|לא הגיע|late|wait|delayed|never showed)\b/i,
    'תקשורת': /\b(?:לא ענו|לא חזרו|נעלמו|unresponsive|didn'?t reply|no response)\b/i,
    'איכות מוצר': /\b(?:איכות גרועה|פגום|שבור|broken|defective|low quality)\b/i,
    'תיאום ציפיות': /\b(?:לא כמו שהובטח|הטעיה|מטעה|misleading|not as advertised|deceiving)\b/i,
    'נקיון/מצב': /\b(?:מלוכלך|לא נקי|מוזנח|dirty|filthy|neglected)\b/i,
}

const REVIEW_PRAISE_KEYWORDS: Record<string, RegExp> = {
    'שירות מצוין': /\b(?:שירות מעולה|אדיבים|מקצועי|excellent service|professional|courteous|kind)\b/i,
    'מחיר הוגן': /\b(?:מחיר הוגן|מחיר טוב|משתלם|fair price|good value|affordable)\b/i,
    'מהירות': /\b(?:מהיר|זריז|fast|quick|prompt)\b/i,
    'אמינות': /\b(?:אמין|מאמין|reliable|trustworthy|honest)\b/i,
    'תקשורת': /\b(?:זמינים|חוזרים|תקשורת מצוינת|responsive|great communication)\b/i,
    'איכות': /\b(?:איכות גבוהה|מצוין|excellent|high quality|outstanding)\b/i,
    'נקיון': /\b(?:נקי|מסודר|clean|tidy|well-maintained)\b/i,
}

function aggregateReviews(reviews: GoogleReviewItem[]): CompetitorReviewsSummary {
    const breakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    let ratingSum = 0
    let ratingCount = 0
    let ownerResponses = 0
    const complaintCounts: Record<string, number> = {}
    const praiseCounts: Record<string, number> = {}
    let sampleNegative: string | undefined
    let samplePositive: string | undefined

    for (const r of reviews) {
        const stars = r.rating?.value
        if (typeof stars === 'number' && stars >= 1 && stars <= 5) {
            const k = String(Math.round(stars)) as '1' | '2' | '3' | '4' | '5'
            breakdown[k]++
            ratingSum += stars
            ratingCount++
        }
        if (r.response?.text && r.response.text.length > 0) ownerResponses++

        const text = (r.review_text || r.translated_text || '').trim()
        if (!text) continue

        // Sentiment classification → use star rating; fallback to neutral.
        const isNeg = stars != null && stars <= 2
        const isPos = stars != null && stars >= 4

        if (isNeg) {
            for (const [theme, re] of Object.entries(REVIEW_COMPLAINT_KEYWORDS)) {
                if (re.test(text)) complaintCounts[theme] = (complaintCounts[theme] || 0) + 1
            }
            if (!sampleNegative && text.length >= 30 && text.length <= 280) {
                sampleNegative = text
            }
        } else if (isPos) {
            for (const [theme, re] of Object.entries(REVIEW_PRAISE_KEYWORDS)) {
                if (re.test(text)) praiseCounts[theme] = (praiseCounts[theme] || 0) + 1
            }
            if (!samplePositive && text.length >= 30 && text.length <= 280) {
                samplePositive = text
            }
        }
    }

    const totalRated = ratingCount || 1
    const positivePct = Math.round(((breakdown['4'] + breakdown['5']) / totalRated) * 100)
    const negativePct = Math.round(((breakdown['1'] + breakdown['2']) / totalRated) * 100)
    const avgRating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0
    const ownerResponseRate = reviews.length > 0 ? Math.round((ownerResponses / reviews.length) * 100) : 0

    const topComplaints = Object.entries(complaintCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([theme, count]) => `${theme} (${count})`)
    const topPraises = Object.entries(praiseCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([theme, count]) => `${theme} (${count})`)

    return {
        sample_size: reviews.length,
        rating_breakdown: breakdown,
        avg_rating: avgRating,
        positive_pct: positivePct,
        negative_pct: negativePct,
        owner_response_rate_pct: ownerResponseRate,
        top_complaints: topComplaints,
        top_praises: topPraises,
        sample_negative_quote: sampleNegative,
        sample_positive_quote: samplePositive,
    }
}

// ── Heuristics for language decision input ──
// These are rough — answers schema is loose. We default toward IL local /
// trust-heavy to match the typical Flowmatic customer profile.

function inferBusinessType(answers: Record<string, unknown>): 'b2b' | 'b2c' | 'mixed' {
    const txt = (
        String(answers.businessDescription || '') + ' ' +
        String(answers.targetAudience || '') + ' ' +
        String(answers.platforms || '')
    ).toLowerCase()
    const b2b = /b2b|saas|enterprise|api|developer|procurement|reseller/i.test(txt)
    const b2c = /b2c|consumer|retail|ecommerce|shop|לקוחות|צרכנים|חנות/i.test(txt)
    if (b2b && !b2c) return 'b2b'
    if (b2c && !b2b) return 'b2c'
    return 'mixed'
}

function inferLocality(answers: Record<string, unknown>): 'il_local' | 'il_national' | 'global_from_il' {
    const txt = (
        String(answers.businessDescription || '') + ' ' +
        String(answers.targetAudience || '')
    ).toLowerCase()
    if (/global|international|worldwide|abroad|export/i.test(txt)) return 'global_from_il'
    if (/local|רחוב|עיר|אזור|סניף|מקומי|near me/i.test(txt)) return 'il_local'
    return 'il_national'
}

/**
 * Phase 4.0 — recover a competitor's brand/business name from the data we
 * already pulled (no extra DFS call). Sources in priority order:
 *
 *   1. onPage.meta.title (homepage <title> — usually "Brand | Tagline")
 *   2. deepPages[0].title (Firecrawl scraped inner page title)
 *   3. og:site_name in onPage meta (if available)
 *
 * Cleanup: strip the trailing " | site description" or " - tagline" so we
 * only feed the brand portion to GMB search. Returns null if no usable
 * name found — caller falls back to the bare domain.
 */
function deriveBusinessNameFromEnrichment(enrich: CompetitorEnrichment): string | null {
    const candidates: string[] = []
    // onPage title
    const onPageTitleArr = enrich.onPage?.meta?.title
    if (typeof onPageTitleArr === 'string' && onPageTitleArr.trim()) {
        candidates.push(onPageTitleArr.trim())
    } else if (Array.isArray(onPageTitleArr) && onPageTitleArr.length > 0 && typeof onPageTitleArr[0] === 'string') {
        candidates.push((onPageTitleArr[0] as string).trim())
    }
    // deepPages titles
    for (const p of enrich.deepPages || []) {
        if (p.title && p.title.trim()) candidates.push(p.title.trim())
    }
    for (const raw of candidates) {
        // Strip everything after a typical title separator. "Get Packing | קרטונים" → "Get Packing".
        const head = raw.split(/\s*[|·–—\-:]\s+/)[0].trim()
        // Filter out generic head terms that aren't brand names. Heuristic:
        // accept if 2-50 chars and not equal to the bare domain.
        if (head && head.length >= 2 && head.length <= 50 && head.toLowerCase() !== enrich.domain.toLowerCase()) {
            return head
        }
    }
    return null
}