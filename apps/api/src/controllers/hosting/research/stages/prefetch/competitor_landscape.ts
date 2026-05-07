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
}

/**
 * Run the pre-fetch. Throws DfsError on PRIMARY failures (no key, no credits,
 * invalid creds, primary endpoint failure). Caller handles → user-friendly
 * 502 response.
 */
export async function prefetchCompetitorLandscape(
    instanceId: string,
    rd: ResearchDataV2,
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
        const [inst] = await db.select({ firecrawlKey: instances.firecrawlKey })
            .from(instances).where(eq(instances.id, instanceId))
        const firecrawlKey = inst?.firecrawlKey
        if (firecrawlKey) {
            firecrawlAvailable = true
            for (const enrich of topEnriched) {
                const deep = await fetchDeepPagesForCompetitor(
                    instanceId, enrich.domain, firecrawlKey, languageCode, trackCall,
                )
                if (deep.length > 0) {
                    enrich.deepPages = deep
                    firecrawlPagesScraped += deep.filter(p => p.fetchOk).length
                } else {
                    enrich.enrichmentMissing.push('deep_pages_unavailable')
                }
            }
        } else {
            for (const enrich of topEnriched) enrich.enrichmentMissing.push('firecrawl_key_not_configured')
            console.warn(`[prefetch/competitor_landscape] firecrawlKey not configured — skipping deep page scrapes`)
        }
    } catch (err) {
        console.warn(`[prefetch/competitor_landscape] deep page fetch loop error:`, (err as Error).message)
    }

    // ─── Phase E2.4 — Google Business reviews per top-5 competitor ──
    // For each competitor, look up GMB → if cid available → fetch up to 50
    // reviews → aggregate sentiment heuristically. Best-effort throughout:
    // many domains aren't in GMB (online-only, B2B, etc.) — skip silently.
    let reviewsFetchedCount = 0
    for (const enrich of topEnriched) {
        try {
            // Try to find GMB entry for this domain
            const gmbRes = await googleMyBusiness(instanceId, enrich.domain, {
                location_code: LOCATION_IL,
                language_code: languageCode,
            })
            trackCall(gmbRes)
            const cid = gmbRes.items[0]?.cid
            if (!cid) {
                enrich.enrichmentMissing.push('gmb_not_found')
                continue
            }
            const revRes = await googleReviews(instanceId, cid, { limit: 50, sortBy: 'newest' })
            trackCall(revRes)
            if (revRes.items.length > 0) {
                enrich.reviews = aggregateReviews(revRes.items)
                reviewsFetchedCount += revRes.items.length
            } else {
                enrich.enrichmentMissing.push('no_reviews_returned')
            }
        } catch (err) {
            enrich.enrichmentMissing.push('reviews_fetch_failed')
            console.warn(`[prefetch/competitor_landscape] reviews ${enrich.domain} failed:`, (err as Error).message)
        }
    }

    console.log(`[prefetch/competitor_landscape] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} hit-rate competitors=${competitors.length} enriched=${topEnriched.length} deep_pages=${firecrawlPagesScraped} reviews=${reviewsFetchedCount}`)

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
): Promise<CompetitorPageSnapshot[]> {
    // 1. Identify top 3 URLs by SERP rank — money-pages signal.
    let topRanked: RankedKeywordItem[] = []
    try {
        const r = await rankedKeywords(instanceId, domain, {
            location_code: LOCATION_IL,
            language_code: languageCode,
            limit: 50,
            filters: [
                ['ranked_serp_element.serp_item.rank_absolute', '<=', 20],
            ],
        })
        trackCall(r)
        topRanked = r.items
    } catch (err) {
        console.warn(`[prefetch/competitor_landscape] rankedKeywords ${domain} failed:`, (err as Error).message)
        return []
    }

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

    if (chosen.length === 0) return []

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

    return snapshots
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