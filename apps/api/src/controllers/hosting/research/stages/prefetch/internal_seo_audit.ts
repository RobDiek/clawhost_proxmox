/**
 * DataForSEO + sitemap pre-fetch for internal_seo_audit stage. Phase E1.2.
 *
 * What we fetch:
 *   1. /robots.txt — structural sanity (Disallow rules, sitemap reference)
 *   2. /sitemap.xml (or /sitemap_index.xml) — URL inventory. We follow
 *      <sitemapindex> indirection one level. Cap at 50 URLs.
 *   3. DFS onPageInstant per URL — cached, parallel batched in groups of 5
 *      to avoid hammering DFS or our own master Anthropic key (latter
 *      irrelevant here but mirrors the polite pattern).
 *   4. Per-URL we extract: title/meta/h1/h2/canonical/word_count/onpage_score/
 *      schema list/page_timing/internal links count (when DFS reports it).
 *   5. Aggregate: schema coverage matrix, duplicate titles/h1s/metas, thin
 *      content list, IA depth proxy (URL path segment count).
 *
 * Hard-fail strategy:
 *   - No domain in answers.websiteUrl → DfsError with clear message.
 *   - Sitemap fetch failure → fall back to crawl seed = [homepage] only;
 *     stage runs in degraded mode and notes "no sitemap" in output.
 *   - Per-URL DFS failures → log + skip; aggregate still produced.
 *
 * Why no Firecrawl in MVP:
 *   DFS onPageInstant returns title, meta, canonical, h1[], h2[], schema[],
 *   page_timing (CWV proxy), word count, total_dom_size, onpage_score.
 *   That covers ~85% of what a real internal audit needs. Internal-link
 *   extraction (full IA depth, orphan detection) requires HTML parsing
 *   which we'll add in Phase E2 with Firecrawl. For MVP we use URL path
 *   depth as a rough IA proxy — good enough to flag deep-buried pages.
 */

import {
    onPageInstant,
    DfsError,
    type OnPageItem,
} from '@/services/research/dataforseo'
import {
    extractH1, extractTitle, extractMetaDescription, extractCanonical,
    extractWordCount, extractOnPageScore, extractSchemas, extractPageTiming,
} from '@/services/research/dataforseo/safeExtract'
import { RunBudget, RunBudgetExceededError } from '@/services/research/dataforseo/runBudget'
import type { ResearchDataV2 } from '@/services/research/types'

export interface UrlAuditEntry {
    url: string
    /** URL path depth — how many `/`-separated segments after the domain.
     *  Rough proxy for click-depth from homepage. 0 = homepage, 1 = /about,
     *  2 = /blog/post-slug, 3 = /blog/category/slug. Real IA depth needs
     *  link extraction (Phase E2). */
    pathDepth: number
    title?: string
    titleLength?: number
    metaDescription?: string
    metaLength?: number
    canonicalUrl?: string
    canonicalSelf?: boolean
    h1List: string[]
    h1Count: number
    h2Count: number
    wordCount?: number
    onpageScore?: number
    /** Schemas detected by DFS — array of @type strings */
    schemaTypes: string[]
    /** Page timing as CWV proxy */
    pageTiming?: {
        lcp_ms?: number
        tti_ms?: number
        dom_complete_ms?: number
    }
    /** DFS audit issues we extract (broken_resources etc.) */
    dfsIssues: string[]
    /** Heuristic page-type classification from URL pattern */
    inferredPageType: string
    /** Issues we detected client-side */
    clientIssues: string[]
    fetchOk: boolean
}

export interface InternalSeoAuditDfsData {
    ourDomain: string
    sitemap: {
        url: string | null
        entryCount: number
        fetchedOk: boolean
        notes: string[]
    }
    robotsTxt: {
        present: boolean
        sitemapReference: string | null
        disallowCount: number
        rawLength: number
        notes: string[]
    }
    urls: UrlAuditEntry[]
    aggregate: {
        crawledCount: number
        avgWordCount: number
        thinContentCount: number          // word_count < 300
        urlsWithoutSchema: number
        urlsWithoutCanonical: number
        urlsWithMissingMeta: number
        urlsWithDuplicateTitle: Array<{ title: string; urls: string[] }>
        urlsWithDuplicateH1: Array<{ h1: string; urls: string[] }>
        urlsWithDuplicateMeta: Array<{ meta: string; urls: string[] }>
        avgOnpageScore: number
        deepPagesCount: number            // pathDepth >= 4
        schemaTypeFrequency: Record<string, number>
    }
    totalCostUsd: number
    cacheHits: number
    cacheMisses: number
    enrichmentMissing: string[]
}

// Phase 2026.01 — coverage cap doubled per spec (internal_seo_audit.yaml)
const URL_CAP = 100
const SITEMAP_FETCH_TIMEOUT_MS = 15_000
const ROBOTS_FETCH_TIMEOUT_MS = 10_000

// Critical-page patterns (always audited if present in sitemap, regardless of sampling)
const CRITICAL_PAGE_PATTERNS: RegExp[] = [
    /\/$/,                                  // homepage variants
    /\/contact\/?$/i,
    /\/about(?:-[a-z0-9-]+)?\/?$/i,
    /\/pricing\/?$/i,
    /\/services?\/?$/i,
    /\/shop\/?$/i,
]

function isCriticalPage(url: string): boolean {
    try {
        const u = new URL(url)
        const path = u.pathname || '/'
        return CRITICAL_PAGE_PATTERNS.some(re => re.test(path))
    } catch {
        return false
    }
}

/**
 * Public entry point.
 *
 * @param agentId Optional. When provided, GSC pages report is pulled for
 *                this agent's connected Search Console site and used as
 *                the primary sampling signal (top-traffic URLs). Without
 *                agentId or without GSC, falls back to critical-page +
 *                sitemap-order sampling.
 */
export async function prefetchInternalSeoAudit(
    instanceId: string,
    rd: ResearchDataV2,
    agentId?: string | null,
): Promise<InternalSeoAuditDfsData> {
    const answers = (rd.answers || {}) as Record<string, unknown>
    const websiteUrl = String(answers.websiteUrl || '').trim()
    if (!websiteUrl) {
        throw new DfsError('task_failed', 'אין domain מוגדר ב-answers.websiteUrl — לא ניתן לבצע אודיט פנימי.')
    }

    let ourDomain: string
    let homepageUrl: string
    try {
        const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
        ourDomain = u.hostname.replace(/^www\./, '')
        homepageUrl = `${u.protocol}//${u.hostname}`
    } catch {
        throw new DfsError('task_failed', `כתובת הדומיין ב-answers.websiteUrl לא תקינה: "${websiteUrl}"`)
    }

    const enrichmentMissing: string[] = []

    // ─── robots.txt
    const robotsTxt = await fetchRobotsTxt(homepageUrl, enrichmentMissing)

    // ─── sitemap inventory
    const sitemap = await discoverSitemap(homepageUrl, robotsTxt.sitemapReference, enrichmentMissing)

    // ─── URL inventory: hybrid sampling per spec v2026.01.
    //
    // Strategy:
    //   - If sitemap ≤ URL_CAP: audit everything (no sampling needed)
    //   - If sitemap > URL_CAP: allocate 50% slots to GSC top-traffic
    //     (real impact pages), 20% to critical pages (homepage/about/
    //     contact/pricing/services/shop), 30% to random fill from
    //     remaining sitemap (coverage).
    //   - Fallback when GSC unavailable: 30% critical + 70% sitemap order.
    //
    // Phase 4.3-T2 dedup: canonical URL keying via normalizeUrl strips
    // trailing slash, fragment, lowercases — same logical page never
    // audited twice.
    const sitemapPool = sitemap.entryCount > 0 ? sitemap.urlsExtracted : [homepageUrl]

    // Try GSC top-traffic pull (best signal for sampling)
    let gscTopUrls: string[] = []
    if (agentId) {
        try {
            gscTopUrls = await pullGSCTopTrafficUrls(instanceId, agentId, ourDomain, 90)
            if (gscTopUrls.length > 0) {
                console.log(`[prefetch/internal_seo_audit] GSC returned ${gscTopUrls.length} top-traffic URLs for sampling`)
            }
        } catch (err) {
            console.warn(`[prefetch/internal_seo_audit] GSC pull failed (non-fatal): ${(err as Error).message}`)
        }
    }

    const inventory = buildHybridInventory({
        sitemapUrls: sitemapPool,
        homepageUrl,
        gscTopUrls,
        cap: URL_CAP,
    })

    if (sitemapPool.length > URL_CAP) {
        enrichmentMissing.push(`sitemap_sampled:${sitemapPool.length}_of_${URL_CAP}`)
    }
    if (sitemapPool.length > URL_CAP && gscTopUrls.length === 0) {
        enrichmentMissing.push('gsc_unavailable_for_sampling')
    }

    // ─── DFS onPageInstant per URL — batched parallel under run budget
    // Phase 2026.01: RunBudget enforces per-stage USD cap from spec
    // (internal_seo_audit.yaml says max_dfs_usd_per_run: 0.50). If we'd
    // exceed, we skip remaining URLs and surface in summary instead of
    // burning past the cap.
    const budget = new RunBudget(0.50, 'internal_seo_audit')
    const audited: UrlAuditEntry[] = []
    const BATCH = 5
    let budgetExceeded = false
    for (let i = 0; i < inventory.length && !budgetExceeded; i += BATCH) {
        const batch = inventory.slice(i, i + BATCH)
        const results = await Promise.allSettled(batch.map(u => onPageInstant(instanceId, u)))
        for (let j = 0; j < results.length; j++) {
            const url = batch[j]
            const res = results[j]
            if (res.status === 'fulfilled') {
                if (res.value.cached) budget.recordCacheHit()
                else { budget.recordCacheMiss(); budget.recordSpend(res.value.cost) }
                const item = res.value.items[0]
                if (item) {
                    audited.push(buildUrlAuditEntry(url, ourDomain, item))
                } else {
                    audited.push(buildEmptyEntry(url, ourDomain, 'no_data_returned'))
                }
            } else {
                console.warn(`[prefetch/internal_seo_audit] onPageInstant ${url} failed:`, (res.reason as Error).message)
                audited.push(buildEmptyEntry(url, ourDomain, 'dfs_call_failed'))
            }
        }
        // After batch: check if we're still within budget for next iteration
        try {
            budget.requireRemaining(0.01)   // rough estimated per-call cost
        } catch (err) {
            if (err instanceof RunBudgetExceededError) {
                budgetExceeded = true
                const remaining = inventory.length - audited.length
                if (remaining > 0) {
                    console.warn(`[prefetch/internal_seo_audit] budget cap hit at ${budget.summary().spent_usd}, skipping ${remaining} remaining URLs`)
                    for (let k = 0; k < remaining; k++) budget.recordSkipped()
                    enrichmentMissing.push(`budget_cap_skipped:${remaining}`)
                }
            }
        }
    }
    // Mirror to legacy local vars (downstream still reads these names)
    const budgetSummary = budget.summary()
    const totalCostUsd = budgetSummary.spent_usd
    const cacheHits = budgetSummary.cache_hits
    const cacheMisses = budgetSummary.cache_misses

    if (audited.filter(a => a.fetchOk).length === 0) {
        enrichmentMissing.push('all_urls_failed')
    }

    // Phase 4.3-S — LD-JSON probe to close DFS coverage gap.
    // DFS's `item.schema[]` covers microdata/RDFa but doesn't always pick up
    // <script type="application/ld+json"> output by Yoast/RankMath/etc. So we
    // do one lightweight HTML fetch per URL, regex out ld+json scripts, and
    // merge their @type values into the entry's schemaTypes. Without this,
    // 100% of WordPress sites get false "no_schema" audit claims.
    //
    // Parallel in batches of 10 with 8s timeout per URL. ~12s total for 50 URLs.
    const LDJSON_BATCH = 10
    let ldJsonAdded = 0
    for (let i = 0; i < audited.length; i += LDJSON_BATCH) {
        const batch = audited.slice(i, i + LDJSON_BATCH).filter(a => a.fetchOk)
        if (batch.length === 0) continue
        const probes = await Promise.allSettled(batch.map(a => probeLdJsonTypes(a.url)))
        for (let j = 0; j < batch.length; j++) {
            const probe = probes[j]
            if (probe.status === 'fulfilled' && probe.value.length > 0) {
                const entry = batch[j]
                // Merge — preserve DFS-detected schemas (microdata/RDFa); add
                // LD-JSON types if they aren't already covered (case-insensitive).
                const existing = new Set(entry.schemaTypes.map(s => s.toLowerCase()))
                for (const t of probe.value) {
                    if (!existing.has(t.toLowerCase())) {
                        entry.schemaTypes.push(t)
                        ldJsonAdded++
                    }
                }
                // Recompute clientIssues with the merged schema list. Specifically
                // the `no_schema` flag must drop if we found ANY schema, and
                // page-type-expected schemas (missing_organization_schema etc)
                // need re-evaluation.
                entry.clientIssues = recomputeClientIssuesAfterLdJson(entry)
            }
        }
    }
    if (ldJsonAdded > 0) {
        console.log(`[prefetch/internal_seo_audit] ld-json probe added ${ldJsonAdded} schema types missed by DFS`)
    }

    const aggregate = computeAggregate(audited)

    console.log(`[prefetch/internal_seo_audit] cost=$${totalCostUsd.toFixed(4)} cache=${cacheHits}/${cacheHits + cacheMisses} urls=${audited.length} avg_words=${aggregate.avgWordCount} deep=${aggregate.deepPagesCount} thin=${aggregate.thinContentCount}`)

    return {
        ourDomain,
        sitemap: {
            url: sitemap.url,
            entryCount: sitemap.entryCount,
            fetchedOk: sitemap.fetchedOk,
            notes: sitemap.notes,
        },
        robotsTxt: {
            present: robotsTxt.present,
            sitemapReference: robotsTxt.sitemapReference,
            disallowCount: robotsTxt.disallowCount,
            rawLength: robotsTxt.rawLength,
            notes: robotsTxt.notes,
        },
        urls: audited,
        aggregate,
        totalCostUsd,
        cacheHits,
        cacheMisses,
        enrichmentMissing,
    }
}

// ────────────────────────────────────────────────────────────────────────────
// robots.txt fetcher

interface RobotsResult {
    present: boolean
    sitemapReference: string | null
    disallowCount: number
    rawLength: number
    notes: string[]
}

async function fetchRobotsTxt(homepageUrl: string, enrichmentMissing: string[]): Promise<RobotsResult> {
    const result: RobotsResult = {
        present: false, sitemapReference: null, disallowCount: 0, rawLength: 0, notes: [],
    }
    try {
        const res = await fetch(`${homepageUrl}/robots.txt`, {
            signal: AbortSignal.timeout(ROBOTS_FETCH_TIMEOUT_MS),
            redirect: 'follow',
        })
        if (!res.ok) {
            enrichmentMissing.push('robots_txt_missing')
            result.notes.push(`HTTP ${res.status}`)
            return result
        }
        const text = await res.text()
        result.present = true
        result.rawLength = text.length
        const sitemapMatch = text.match(/^[\s]*Sitemap:\s*(\S+)/im)
        if (sitemapMatch) result.sitemapReference = sitemapMatch[1].trim()
        result.disallowCount = (text.match(/^[\s]*Disallow:/gim) || []).length
        if (text.length < 50) result.notes.push('robots.txt suspiciously short')
        return result
    } catch (err) {
        enrichmentMissing.push('robots_txt_fetch_failed')
        result.notes.push((err as Error).message)
        return result
    }
}

// ────────────────────────────────────────────────────────────────────────────
// sitemap discoverer

interface SitemapResult {
    url: string | null
    entryCount: number
    urlsExtracted: string[]
    fetchedOk: boolean
    notes: string[]
}

async function discoverSitemap(
    homepageUrl: string,
    referencedFromRobots: string | null,
    enrichmentMissing: string[],
): Promise<SitemapResult> {
    const result: SitemapResult = {
        url: null, entryCount: 0, urlsExtracted: [], fetchedOk: false, notes: [],
    }
    const candidates = [
        referencedFromRobots,
        `${homepageUrl}/sitemap.xml`,
        `${homepageUrl}/sitemap_index.xml`,
    ].filter(Boolean) as string[]

    for (const sitemapUrl of candidates) {
        try {
            const res = await fetch(sitemapUrl, {
                signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS),
                redirect: 'follow',
            })
            if (!res.ok) continue
            const xml = await res.text()
            // sitemap-index → follow first nested sitemap
            if (/<sitemapindex/i.test(xml)) {
                const nested = (xml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || [])
                    .map(m => m.replace(/<\/?loc>/gi, '').trim())
                    .slice(0, 3)
                result.notes.push(`sitemap_index → following ${nested.length} child sitemaps`)
                const urls: string[] = []
                for (const child of nested) {
                    try {
                        const childRes = await fetch(child, { signal: AbortSignal.timeout(SITEMAP_FETCH_TIMEOUT_MS) })
                        if (!childRes.ok) continue
                        const childXml = await childRes.text()
                        const childUrls = (childXml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || [])
                            .map(m => m.replace(/<\/?loc>/gi, '').trim())
                            .filter(u => u.startsWith('http'))
                        urls.push(...childUrls)
                        if (urls.length >= URL_CAP * 2) break
                    } catch (err) {
                        result.notes.push(`child sitemap ${child} failed: ${(err as Error).message}`)
                    }
                }
                result.url = sitemapUrl
                result.urlsExtracted = urls
                result.entryCount = urls.length
                result.fetchedOk = true
                return result
            }
            // regular sitemap
            const urls = (xml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || [])
                .map(m => m.replace(/<\/?loc>/gi, '').trim())
                .filter(u => u.startsWith('http'))
            result.url = sitemapUrl
            result.urlsExtracted = urls
            result.entryCount = urls.length
            result.fetchedOk = true
            return result
        } catch (err) {
            result.notes.push(`${sitemapUrl} failed: ${(err as Error).message}`)
        }
    }

    enrichmentMissing.push('sitemap_not_found')
    return result
}

// ────────────────────────────────────────────────────────────────────────────
// URL audit entry builder

function buildUrlAuditEntry(url: string, ourDomain: string, item: OnPageItem): UrlAuditEntry {
    void ourDomain
    // Phase 2026.01 migration — all field extractions go through safeExtract.
    // This closes the field-name drift class of bugs that caused the H1
    // false-claims regression (meta.htags.h1 vs meta.h1) AND the recent
    // product-schema regression. Every reader now uses the same safe path
    // resolver + drift detection.
    const pathDepth = computePathDepth(url)
    const h1 = extractH1(item)
    const titleEx = extractTitle(item)
    const metaEx = extractMetaDescription(item)
    const canonical = extractCanonical(item)
    const canonicalSelf = canonical ? normalizeUrl(canonical) === normalizeUrl(url) : false
    const wordCount = extractWordCount(item)
    const onPageScore = extractOnPageScore(item)
    const schemaTypes = extractSchemas(item)
    const timing = extractPageTiming(item)
    const pageTiming = {
        lcp_ms: timing.lcp_ms ?? undefined,
        tti_ms: timing.tti_ms ?? undefined,
        dom_complete_ms: timing.dom_complete_ms ?? undefined,
    }

    // legacy h2 list — keep raw access until we add extractH2 helper. h2 used
    // less than h1 and isn't tied to the regression bug class.
    const h2Raw = item.meta?.htags?.h2 || item.meta?.h2 || []
    const h2List = h2Raw.filter(h => h && h.trim().length > 0)

    // DFS sometimes returns broken_resources / checks fields — surface them
    const dfsIssues: string[] = []
    const checks = item.checks
    if (checks) {
        for (const [k, v] of Object.entries(checks)) {
            if (v === true) dfsIssues.push(k)
        }
    }

    const title = titleEx.text || undefined
    const metaDescription = metaEx.text || undefined
    const inferredPageType = inferPageType(url, title || '')
    const clientIssues = detectClientIssues({
        title, meta: metaDescription, h1List: h1.texts, wordCount,
        canonical: canonical || undefined, canonicalSelf,
        schemaTypes, inferredPageType, dfsChecks: checks,
    })

    return {
        url,
        pathDepth,
        title,
        titleLength: titleEx.length || undefined,
        metaDescription,
        metaLength: metaEx.length || undefined,
        canonicalUrl: canonical || undefined,
        canonicalSelf,
        h1List: h1.texts,
        h1Count: h1.count,
        h2Count: h2List.length,
        wordCount: wordCount || undefined,
        onpageScore: onPageScore || undefined,
        schemaTypes,
        pageTiming,
        dfsIssues,
        inferredPageType,
        clientIssues,
        fetchOk: true,
    }
}

function buildEmptyEntry(url: string, _ourDomain: string, reason: string): UrlAuditEntry {
    return {
        url,
        pathDepth: computePathDepth(url),
        h1List: [],
        h1Count: 0,
        h2Count: 0,
        schemaTypes: [],
        dfsIssues: [reason],
        inferredPageType: 'unknown',
        clientIssues: ['fetch_failed'],
        fetchOk: false,
    }
}

function computePathDepth(url: string): number {
    try {
        const u = new URL(url)
        const path = u.pathname.replace(/^\/|\/$/g, '')
        if (!path) return 0
        return path.split('/').filter(Boolean).length
    } catch {
        return 0
    }
}

function normalizeUrl(u: string): string {
    try {
        const url = new URL(u)
        url.hash = ''
        let s = url.toString()
        if (s.endsWith('/')) s = s.slice(0, -1)
        return s.toLowerCase()
    } catch {
        return u.toLowerCase()
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2026.01 — Hybrid sampling (GSC top-traffic + critical + random fill)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pull top-traffic URLs for the agent's connected Search Console site.
 * Returns URLs sorted by clicks DESC. Returns [] silently if GSC not
 * connected, tokens expired, scope missing, or site not in user's GSC.
 */
async function pullGSCTopTrafficUrls(
    instanceId: string,
    agentId: string,
    ourDomain: string,
    days: number,
): Promise<string[]> {
    // Load agent's GSC integration. agentType='mateh' since research stages
    // run under marketing agents (Mazhir scope).
    const { getAgentIntegrations } = await import('@/services/agentIntegrations')
    const integrations = await getAgentIntegrations(instanceId, 'mt', agentId)
    const gsc = integrations.find(i => i.integrationType === 'gsc' || i.integrationType === 'google')
    if (!gsc) return []
    const cfg = (gsc.config as Record<string, unknown>) || {}
    const tokens = (cfg.tokens || cfg) as { accessToken?: string; refreshToken?: string; expiresAt?: number; scopes?: string[] }
    if (!tokens.refreshToken) return []

    const { pullGSCPages } = await import('@/services/gscPagesEnrich')
    const candidateSites = [
        `https://${ourDomain}/`,
        `https://${ourDomain}`,
        `sc-domain:${ourDomain}`,
        `https://www.${ourDomain}/`,
    ]
    for (const siteUrl of candidateSites) {
        try {
            const r = await pullGSCPages(tokens, siteUrl, days)
            if (r.available && r.pages.length > 0) {
                // Sort by clicks DESC, return URLs only
                return r.pages
                    .slice()
                    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
                    .map(p => p.page)
                    .filter(u => typeof u === 'string' && u.length > 0)
            }
        } catch {
            // try next candidate
        }
    }
    return []
}

interface HybridInventoryOpts {
    sitemapUrls: string[]
    homepageUrl: string
    gscTopUrls: string[]
    cap: number
}

/**
 * Build inventory using hybrid sampling strategy:
 *   - If sitemap ≤ cap: take all (no sampling)
 *   - With GSC: 50% top-traffic + 20% critical + 30% random fill
 *   - Without GSC: 30% critical + 70% sitemap order
 *
 * Always includes homepage. All URLs canonical-deduped via normalizeUrl key.
 */
function buildHybridInventory(opts: HybridInventoryOpts): string[] {
    const { sitemapUrls, homepageUrl, gscTopUrls, cap } = opts
    const sitemapSet = new Set(sitemapUrls.map(normalizeUrl))
    const usedKeys = new Set<string>()
    const inventory: string[] = []

    function add(u: string): boolean {
        if (!u || typeof u !== 'string') return false
        const key = normalizeUrl(u)
        if (!key || usedKeys.has(key)) return false
        usedKeys.add(key)
        inventory.push(u)
        return true
    }

    // 1. Homepage always
    add(homepageUrl)

    // 2. If sitemap fits within cap, take all
    if (sitemapUrls.length <= cap) {
        for (const u of sitemapUrls) add(u)
        return inventory.slice(0, cap)
    }

    // 3. Sampling mode
    const useGsc = gscTopUrls.length > 0
    const criticalQuota = useGsc ? Math.floor(cap * 0.20) : Math.floor(cap * 0.30)
    const gscQuota      = useGsc ? Math.floor(cap * 0.50) : 0
    const randomQuota   = cap - criticalQuota - gscQuota - inventory.length  // remainder

    // 3a. Critical pages from sitemap
    let criticalAdded = 0
    for (const u of sitemapUrls) {
        if (criticalAdded >= criticalQuota) break
        if (isCriticalPage(u) && add(u)) criticalAdded++
    }

    // 3b. GSC top-traffic (filter to URLs that are on our site)
    if (useGsc) {
        let gscAdded = 0
        for (const u of gscTopUrls) {
            if (gscAdded >= gscQuota) break
            // Only include if URL is in the sitemap (avoid 404s on outdated GSC data)
            if (sitemapSet.has(normalizeUrl(u)) && add(u)) gscAdded++
        }
    }

    // 3c. Random fill from remaining sitemap
    const remaining = sitemapUrls.filter(u => !usedKeys.has(normalizeUrl(u)))
    // Deterministic "random" — use modulo stride over remaining to spread the sample
    const stride = Math.max(1, Math.floor(remaining.length / Math.max(1, randomQuota + 5)))
    let idx = 0
    let filled = 0
    while (filled < randomQuota && idx < remaining.length) {
        if (add(remaining[idx])) filled++
        idx += stride
    }
    // Backfill any remaining slots from start
    for (const u of remaining) {
        if (inventory.length >= cap) break
        add(u)
    }

    return inventory.slice(0, cap)
}

/**
 * Heuristic page-type classification. Real classification needs full HTML +
 * content analysis; this is enough to drive schema-coverage expectations.
 */
function inferPageType(url: string, title: string): string {
    const u = url.toLowerCase()
    const t = title.toLowerCase()
    try {
        const path = new URL(u).pathname.replace(/\/$/, '')
        if (!path || path === '' || path === '/') return 'homepage'
        if (/\/blog\/|\/articles\/|\/posts\//.test(path)) return 'blog_post'
        if (/\/about|\/אודות/.test(path)) return 'about'
        if (/\/contact|\/צור-קשר|\/צור_קשר/.test(path)) return 'contact'
        if (/\/pricing|\/מחירים|\/מחירון/.test(path)) return 'pricing'
        if (/\/faq|\/שאלות/.test(path)) return 'faq'
        if (/\/products?\/|\/מוצר\//.test(path)) return 'product'
        if (/\/services?\/|\/שירות\//.test(path)) return 'service'
        if (/\/category|\/קטגוריה/.test(path)) return 'category'
        if (/\/storage\/|\/locations?\/|\/branches?\//.test(path)) return 'local_page'
        if (/\/tag\//.test(path)) return 'tag'
    } catch { /* fall through */ }
    if (t.includes('faq') || t.includes('שאלות נפוצות')) return 'faq'
    return 'other'
}

interface ClientIssueArgs {
    title?: string
    meta?: string
    h1List: string[]
    wordCount?: number
    canonical?: string
    canonicalSelf: boolean
    schemaTypes: string[]
    inferredPageType: string
    /** DFS-emitted boolean ground-truth checks. When DFS says `no_h1_tag: false`
     *  we trust it over an empty h1List (which can happen if extraction missed
     *  the field path — exactly the bug Sergei caught). */
    dfsChecks?: Record<string, boolean>
}

function detectClientIssues(a: ClientIssueArgs): string[] {
    const issues: string[] = []
    // Phase 4.3-R: cross-check with DFS's own checks before flagging absence.
    // DFS sees the rendered HTML — if its `no_h1_tag=false`, we MUST not say
    // "missing_h1" even if our extracted h1List came up empty (extraction
    // mismatch class bug). Same for title / description.
    const dfsSaysNoTitle = a.dfsChecks?.no_title === true
    const dfsSaysNoDesc = a.dfsChecks?.no_description === true
    const dfsSaysNoH1 = a.dfsChecks?.no_h1_tag === true

    if (!a.title && (!a.dfsChecks || dfsSaysNoTitle)) issues.push('missing_title')
    else if (a.title && a.title.length < 30) issues.push('short_title')
    else if (a.title && a.title.length > 70) issues.push('long_title')

    if (!a.meta && (!a.dfsChecks || dfsSaysNoDesc)) issues.push('missing_meta_description')
    else if (a.meta && a.meta.length < 70) issues.push('short_meta_description')
    else if (a.meta && a.meta.length > 170) issues.push('long_meta_description')

    if (a.h1List.length === 0 && (!a.dfsChecks || dfsSaysNoH1)) issues.push('missing_h1')
    else if (a.h1List.length > 1) issues.push('multiple_h1')

    if (a.wordCount !== undefined && a.wordCount < 300) issues.push('thin_content')

    if (!a.canonical) issues.push('missing_canonical')
    else if (!a.canonicalSelf) issues.push('non_self_canonical')

    if (a.schemaTypes.length === 0) issues.push('no_schema')

    // Page-type → expected schema mapping
    const expected = expectedSchemaForType(a.inferredPageType)
    for (const e of expected) {
        if (!a.schemaTypes.some(s => s.toLowerCase().includes(e.toLowerCase()))) {
            issues.push(`missing_${e.toLowerCase()}_schema`)
        }
    }

    return issues
}

function expectedSchemaForType(pageType: string): string[] {
    switch (pageType) {
        case 'homepage':    return ['Organization', 'WebSite']
        case 'product':     return ['Product']
        case 'service':     return ['Service']
        case 'pricing':     return ['Service']
        case 'faq':         return ['FAQPage']
        case 'blog_post':   return ['Article']
        case 'about':       return ['Organization']
        case 'contact':     return ['Organization']
        case 'local_page':  return ['LocalBusiness']
        default:            return []
    }
}

// ─── Phase 4.3-S: LD-JSON probe ────────────────────────────────────────────
// Lightweight HTML fetch + regex extraction of <script type="application/ld+json">.
// Used to supplement DFS's `item.schema[]` which only covers microdata/RDFa.
const LDJSON_FETCH_TIMEOUT_MS = 8_000
const LDJSON_UA = 'Mozilla/5.0 (compatible; FlowmaticAudit/1.0; +https://flowmatic.co.il)'

async function probeLdJsonTypes(url: string): Promise<string[]> {
    // Phase 2026.01: full diagnostic logging on miss — needed to debug the
    // product-schema regression where parallel probe to Hebrew-encoded
    // product URLs returned [] (suspected Cloudflare WAF or rate limit).
    let httpStatus = 0
    let bodyLen = 0
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': LDJSON_UA, 'Accept': 'text/html,*/*' },
            redirect: 'follow',
            signal: AbortSignal.timeout(LDJSON_FETCH_TIMEOUT_MS),
        })
        httpStatus = res.status
        if (!res.ok) {
            console.warn(`[ldJsonProbe] non-OK ${httpStatus} for ${url.slice(0, 100)} — skipping LD-JSON enrichment`)
            return []
        }
        const html = await res.text()
        bodyLen = html.length
        const types: string[] = []
        const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        let m: RegExpExecArray | null
        while ((m = re.exec(html)) !== null) {
            try {
                const parsed = JSON.parse(m[1].trim())
                collectTypes(parsed, types)
            } catch { /* invalid LD-JSON; skip */ }
        }
        const unique = Array.from(new Set(types))
        if (unique.length === 0 && bodyLen > 5000) {
            // Body big enough that LD-JSON SHOULD be there for a WordPress page
            // (Yoast/RankMath inject schemas in head). Zero matches = likely
            // Cloudflare challenge page returning 200 with JS challenge, OR
            // page genuinely has no LD-JSON. Log for diagnostics.
            console.warn(`[ldJsonProbe] 0 types found despite ${bodyLen}b body for ${url.slice(0, 100)} — suspect WAF challenge or genuine absence`)
        }
        return unique
    } catch (err) {
        // Network errors are non-fatal — DFS data still flows through, we just
        // miss the LD-JSON enrichment for this URL.
        const e = err as Error
        console.warn(`[ldJsonProbe] fetch failed for ${url.slice(0, 100)}: ${e.name}/${e.message}`)
        return []
    }
}

function collectTypes(node: unknown, out: string[]): void {
    if (!node) return
    if (Array.isArray(node)) { for (const n of node) collectTypes(n, out); return }
    if (typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const t = obj['@type']
    if (typeof t === 'string') out.push(t)
    else if (Array.isArray(t)) for (const tt of t) if (typeof tt === 'string') out.push(tt)
    // Recurse into @graph (common Yoast pattern)
    const graph = obj['@graph']
    if (Array.isArray(graph)) for (const g of graph) collectTypes(g, out)
}

/**
 * Recompute clientIssues after LD-JSON schemas were merged into schemaTypes.
 * Specifically drops `no_schema` if any schema now present, and drops
 * `missing_X_schema` for each expected type that's now satisfied.
 *
 * Other issues (missing_h1 / canonical / thin_content etc) are not affected
 * by the LD-JSON merge — preserve them as-is.
 */
function recomputeClientIssuesAfterLdJson(entry: UrlAuditEntry): string[] {
    const remaining: string[] = []
    const schemaLower = entry.schemaTypes.map(s => s.toLowerCase())
    const expected = expectedSchemaForType(entry.inferredPageType)
    for (const issue of entry.clientIssues) {
        if (issue === 'no_schema') {
            if (entry.schemaTypes.length > 0) continue  // drop — now we have schema
        }
        const missingMatch = issue.match(/^missing_(.+)_schema$/)
        if (missingMatch) {
            const target = missingMatch[1]
            // Drop if any schemaType contains this expected name (case-insensitive)
            if (schemaLower.some(s => s.includes(target))) continue
            // Also drop if the expected list itself is empty for this page type
            if (expected.length === 0) continue
        }
        remaining.push(issue)
    }
    return remaining
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregate computation

function computeAggregate(urls: UrlAuditEntry[]): InternalSeoAuditDfsData['aggregate'] {
    const ok = urls.filter(u => u.fetchOk)
    const titles: Record<string, string[]> = {}
    const h1s: Record<string, string[]> = {}
    const metas: Record<string, string[]> = {}
    let wordSum = 0
    let wordSamples = 0
    let scoreSum = 0
    let scoreSamples = 0
    let thinCount = 0
    let noSchemaCount = 0
    let noCanonicalCount = 0
    let missingMetaCount = 0
    let deepCount = 0
    const schemaFreq: Record<string, number> = {}

    for (const u of ok) {
        if (u.title) {
            const k = u.title.trim().toLowerCase()
            if (!titles[k]) titles[k] = []
            titles[k].push(u.url)
        }
        if (u.h1List[0]) {
            const k = u.h1List[0].trim().toLowerCase()
            if (!h1s[k]) h1s[k] = []
            h1s[k].push(u.url)
        }
        if (u.metaDescription) {
            const k = u.metaDescription.trim().toLowerCase()
            if (!metas[k]) metas[k] = []
            metas[k].push(u.url)
        } else {
            missingMetaCount++
        }
        if (u.wordCount !== undefined) { wordSum += u.wordCount; wordSamples++ }
        if (u.onpageScore !== undefined) { scoreSum += u.onpageScore; scoreSamples++ }
        if (u.wordCount !== undefined && u.wordCount < 300) thinCount++
        if (u.schemaTypes.length === 0) noSchemaCount++
        if (!u.canonicalUrl) noCanonicalCount++
        if (u.pathDepth >= 4) deepCount++
        for (const s of u.schemaTypes) {
            schemaFreq[s] = (schemaFreq[s] || 0) + 1
        }
    }

    const onlyDuplicates = (map: Record<string, string[]>) =>
        Object.entries(map)
            .filter(([, urls]) => urls.length > 1)
            .map(([key, urls]) => ({ key, urls }))

    return {
        crawledCount: ok.length,
        avgWordCount: wordSamples > 0 ? Math.round(wordSum / wordSamples) : 0,
        thinContentCount: thinCount,
        urlsWithoutSchema: noSchemaCount,
        urlsWithoutCanonical: noCanonicalCount,
        urlsWithMissingMeta: missingMetaCount,
        urlsWithDuplicateTitle: onlyDuplicates(titles).map(d => ({ title: d.key, urls: d.urls })),
        urlsWithDuplicateH1: onlyDuplicates(h1s).map(d => ({ h1: d.key, urls: d.urls })),
        urlsWithDuplicateMeta: onlyDuplicates(metas).map(d => ({ meta: d.key, urls: d.urls })),
        avgOnpageScore: scoreSamples > 0 ? Math.round((scoreSum / scoreSamples) * 100) / 100 : 0,
        deepPagesCount: deepCount,
        schemaTypeFrequency: schemaFreq,
    }
}