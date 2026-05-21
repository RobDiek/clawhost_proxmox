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

const URL_CAP = 50
const SITEMAP_FETCH_TIMEOUT_MS = 15_000
const ROBOTS_FETCH_TIMEOUT_MS = 10_000

/**
 * Public entry point.
 */
export async function prefetchInternalSeoAudit(
    instanceId: string,
    rd: ResearchDataV2,
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

    // ─── URL inventory: prefer sitemap; fall back to homepage-only.
    //
    // Phase 4.3-T2: canonicalize + dedupe BEFORE sending to DFS. Without
    // this, sitemaps that include trailing-slash variants of the homepage
    // (or any path) produced two records for the same logical URL —
    // wasting an audit slot AND generating false `duplicate_title` /
    // `duplicate_about` issues since the audit found "two pages with the
    // same title". Canonical form: lowercased, no fragment, single
    // trailing slash for root (`https://domain/`), no trailing slash for
    // sub-paths (`/about`, not `/about/`).
    const rawInventory = sitemap.entryCount > 0 ? sitemap.urlsExtracted.slice(0, URL_CAP * 2) : [homepageUrl]
    const seen = new Set<string>()
    const inventory: string[] = []
    for (const u of [homepageUrl, ...rawInventory]) {
        const key = normalizeUrl(u)   // strips trailing slash, fragment, lowercase
        if (!key || seen.has(key)) continue
        seen.add(key)
        inventory.push(u)
        if (inventory.length >= URL_CAP) break
    }

    // ─── DFS onPageInstant per URL — batched parallel
    let totalCostUsd = 0
    let cacheHits = 0
    let cacheMisses = 0
    const trackCall = <T>(r: { cost: number; cached: boolean; items: T[] }) => {
        totalCostUsd += r.cost
        if (r.cached) cacheHits++
        else cacheMisses++
        return r
    }

    const audited: UrlAuditEntry[] = []
    const BATCH = 5
    for (let i = 0; i < inventory.length; i += BATCH) {
        const batch = inventory.slice(i, i + BATCH)
        const results = await Promise.allSettled(batch.map(u => onPageInstant(instanceId, u)))
        for (let j = 0; j < results.length; j++) {
            const url = batch[j]
            const res = results[j]
            if (res.status === 'fulfilled') {
                trackCall(res.value)
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
    }

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
    const pathDepth = computePathDepth(url)
    const title = item.meta?.title?.trim()
    const meta = item.meta?.description?.trim()
    // Phase 4.3-R(fix1) — H1/H2 live at `meta.htags.h1` / `meta.htags.h2` in
    // the actual DFS response. Older legacy callers expected `meta.h1` and
    // got `undefined` → audit reported false "missing_h1" on pages that had
    // it. We now prefer `htags.h1` and fall back to legacy `h1` (in case any
    // DFS version returns it that way). Same fix for h2.
    const h1Raw = item.meta?.htags?.h1 || item.meta?.h1 || []
    const h2Raw = item.meta?.htags?.h2 || item.meta?.h2 || []
    const h1List = h1Raw.filter(h => h && h.trim().length > 0)
    const h2List = h2Raw.filter(h => h && h.trim().length > 0)
    const wordCount = item.meta?.content?.plain_text_word_count
    const canonical = item.meta?.canonical?.trim()
    const canonicalSelf = canonical ? normalizeUrl(canonical) === normalizeUrl(url) : false
    const schemaTypes = (item.schema || []).map(s => String(s.type || '')).filter(Boolean)
    const pageTiming = {
        lcp_ms: item.page_timing?.largest_contentful_paint,
        tti_ms: item.page_timing?.time_to_interactive,
        dom_complete_ms: item.page_timing?.dom_complete,
    }

    const dfsIssues: string[] = []
    // DFS sometimes returns broken_resources / checks fields — surface them
    const checks = item.checks
    if (checks) {
        for (const [k, v] of Object.entries(checks)) {
            if (v === true) dfsIssues.push(k)
        }
    }

    const inferredPageType = inferPageType(url, title || '')
    const clientIssues = detectClientIssues({
        title, meta, h1List, wordCount, canonical, canonicalSelf, schemaTypes, inferredPageType,
        dfsChecks: checks,
    })

    return {
        url,
        pathDepth,
        title,
        titleLength: title?.length,
        metaDescription: meta,
        metaLength: meta?.length,
        canonicalUrl: canonical,
        canonicalSelf,
        h1List,
        h1Count: h1List.length,
        h2Count: h2List.length,
        wordCount,
        onpageScore: item.onpage_score,
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
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': LDJSON_UA, 'Accept': 'text/html,*/*' },
            redirect: 'follow',
            signal: AbortSignal.timeout(LDJSON_FETCH_TIMEOUT_MS),
        })
        if (!res.ok) return []
        const html = await res.text()
        const types: string[] = []
        const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        let m: RegExpExecArray | null
        while ((m = re.exec(html)) !== null) {
            try {
                const parsed = JSON.parse(m[1].trim())
                // LD-JSON can be: {@type:X}, [{@type:X},...], or {@graph:[...]}
                collectTypes(parsed, types)
            } catch { /* invalid LD-JSON; skip */ }
        }
        return Array.from(new Set(types))
    } catch (err) {
        // Network errors are non-fatal — DFS data still flows through, we just
        // miss the LD-JSON enrichment for this URL.
        void err
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