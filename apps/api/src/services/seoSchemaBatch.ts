/**
 * SEO Schema (JSON-LD) Batch — full-set structured data for existing WP pages.
 *
 * Per Sergei's choice (2026-06-01): Flowmatic OWNS the page's structured data
 * (full-set replacement). For each published page/post lacking our schema, we
 * generate ONE complete schema.org @graph (Organization + WebSite + WebPage/
 * Article + BreadcrumbList + FAQPage when FAQ content exists) and store it in
 * the `_clawflow_schema_jsonld` post meta. The companion plugin v1.9.0 renders
 * it in <head> and suppresses Yoast/Rank Math schema for that page (one graph,
 * no duplicates).
 *
 * Invoked by monthlyTaskExecutor's runSeoSchemaBatchAdapter AFTER the user has
 * approved the task ([[feedback_no_automatic_actions]]). Idempotent: a page
 * that already has our schema meta is skipped on the next run.
 */
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'
import { getBuilderInfo } from '@/services/wpBuilderInfo'
import { isFunctionalPage } from '@/services/seoPageClassify'

const MAX_UPDATES_PER_RUN = 15
const MAX_SCAN_PAGES = 5

// Bumped whenever generateSchema learns to emit a new node TYPE. Stored at the
// JSON-LD doc root (`_fmSchemaV`). A stored graph below this version is treated
// as stale → re-generated once so it picks up the newer node types (this is the
// "enrich, don't skip-if-any" rollout). After re-gen it stamps the current
// version and is stable. v2 = added VideoObject (from real embedded video).
// v3 (2026-06): removed retired WebSite SearchAction (Sitelinks Searchbox,
// retired by Google 2024-11-21). Bump → existing v2 graphs re-generate without it.
const SCHEMA_GEN_VERSION = 3

type WpContentType = 'posts' | 'pages'

// A real video embed discovered in page content. Only emitted from concrete
// embeds (no fabricated metadata): YouTube/Vimeo IDs or a self-hosted <video>.
interface VideoRef {
    provider: 'youtube' | 'vimeo' | 'file'
    contentUrl: string
    embedUrl?: string
    thumbnailUrl?: string
}

interface SchemaItem {
    type: WpContentType
    id: number
    title: string
    link: string
    excerpt: string
    contentSnippet: string
    videos: VideoRef[]
    hasOurSchema: boolean
    /** Existing Flowmatic graph is incomplete/outdated → re-generate to enrich. */
    stale: boolean
    /** Why this page is a candidate: brand-new schema vs enriching a stale one. */
    reason: 'new' | 'enrich'
}

export interface SeoSchemaBatchResult {
    ok: boolean
    integrationMissing: boolean
    authError: boolean
    scanned: number
    candidates: number
    updated: Array<{ type: WpContentType; id: number; title: string; link: string; types: string[]; reason: 'new' | 'enrich' }>
    failures: Array<{ type: WpContentType; id: number; error: string }>
    error?: string
}

function authHeader(cfg: WpCfg): string {
    return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64')
}

// This host sits behind Cloudflare and intermittently returns 522/504 origin
// timeouts. Retry transient gateway errors (and network aborts) with backoff so
// a single hiccup doesn't fail the whole batch.
const TRANSIENT = new Set([429, 502, 503, 504, 520, 521, 522, 524])
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
    let lastErr: Error | null = null
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, init)
            if (TRANSIENT.has(res.status) && i < tries - 1) {
                await new Promise(r => setTimeout(r, 1500 * (i + 1)))
                continue
            }
            return res
        } catch (err) {
            lastErr = err as Error
            if (i < tries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)))
        }
    }
    if (lastErr) throw lastErr
    throw new Error('fetchRetry exhausted')
}
function normalizeUrl(url: string): string { return url.replace(/\/+$/, '') }
function stripHtml(s: string): string {
    return String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Inspect a stored `_clawflow_schema_jsonld` value (already returned by the list
 * scan — no extra fetch). Returns whether it's ours and whether it's STALE, i.e.
 * missing a base node we now always emit OR stamped below the current generator
 * version. Stale graphs are re-generated so existing pages gain newer node types
 * (and shed retired ones like SearchAction). "Enrich, don't skip-if-any".
 */
export function analyzeStored(raw: string): { hasOurSchema: boolean; stale: boolean } {
    const s = (raw || '').trim()
    if (!s) return { hasOurSchema: false, stale: false }
    let doc: { '@graph'?: Array<Record<string, unknown>>; _fmSchemaV?: number }
    try { doc = JSON.parse(s) } catch { return { hasOurSchema: true, stale: true } } // unparseable → re-gen
    const graph = Array.isArray(doc['@graph']) ? doc['@graph'] : []
    const typeOf = (n: Record<string, unknown>) => String(n['@type'] || '')
    const types = new Set(graph.map(typeOf))
    const version = typeof doc._fmSchemaV === 'number' ? doc._fmSchemaV : 0
    const missingBase = !types.has('Organization') || !types.has('WebSite') || !types.has('BreadcrumbList')
    // Version stamp drives staleness — v2 graphs (with the retired SearchAction)
    // are < v3 → re-generated without it.
    const stale = missingBase || version < SCHEMA_GEN_VERSION
    return { hasOurSchema: true, stale }
}

/** Extract real video embeds from raw page HTML. Deterministic, no fabrication. */
export function detectVideos(html: string): VideoRef[] {
    const out: VideoRef[] = []
    const seen = new Set<string>()
    const push = (v: VideoRef) => { if (!seen.has(v.contentUrl)) { seen.add(v.contentUrl); out.push(v) } }
    const src = String(html || '')
    // YouTube: embed/<id>, youtu.be/<id>, watch?v=<id>
    for (const m of src.matchAll(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/g)) {
        const id = m[1]
        push({ provider: 'youtube', contentUrl: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube.com/embed/${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` })
    }
    // Vimeo: player.vimeo.com/video/<id> or vimeo.com/<id>
    for (const m of src.matchAll(/(?:player\.vimeo\.com\/video\/|vimeo\.com\/)(\d{6,})/g)) {
        const id = m[1]
        push({ provider: 'vimeo', contentUrl: `https://vimeo.com/${id}`, embedUrl: `https://player.vimeo.com/video/${id}` })
    }
    // Self-hosted <video><source src="...mp4">
    for (const m of src.matchAll(/<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|webm|ogv|mov))["']/gi)) {
        push({ provider: 'file', contentUrl: m[1] })
    }
    return out.slice(0, 3)
}

async function listSchemaCandidates(cfg: WpCfg): Promise<{ candidates: SchemaItem[]; scanned: number }> {
    const base = normalizeUrl(cfg.url)
    const all: SchemaItem[] = []
    let scanned = 0
    for (const type of ['posts', 'pages'] as WpContentType[]) {
        for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
            // NOTE: do NOT request `content` here — Elementor pages embed huge
            // HTML and pulling 100× full bodies times out. We fetch content
            // per-candidate later (capped at MAX_UPDATES_PER_RUN).
            const url = `${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=id,title,link,excerpt,meta`
            let res: Response
            try {
                res = await fetchRetry(url, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
            } catch (err) {
                throw new Error(`WP GET ${type} p${page} failed: ${(err as Error).message}`)
            }
            if (res.status === 400) break
            if (!res.ok) throw new Error(`WP GET ${type} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
            const items = await res.json().catch(() => []) as Array<{
                id?: number; title?: { rendered?: string }; link?: string
                excerpt?: { rendered?: string }
                meta?: Record<string, unknown>
            }>
            if (!Array.isArray(items) || items.length === 0) break
            for (const it of items) {
                if (typeof it.id !== 'number') continue
                scanned++
                const existing = it.meta && typeof it.meta._clawflow_schema_jsonld === 'string' ? it.meta._clawflow_schema_jsonld as string : ''
                const { hasOurSchema, stale } = analyzeStored(existing)
                all.push({
                    type, id: it.id,
                    title: stripHtml(it.title?.rendered || `#${it.id}`),
                    link: it.link || '',
                    excerpt: stripHtml(it.excerpt?.rendered || ''),
                    contentSnippet: '',   // filled per-candidate before generation
                    videos: [],           // filled per-candidate before generation
                    hasOurSchema,
                    stale,
                    reason: hasOurSchema ? 'enrich' : 'new',
                })
            }
            if (items.length < 100) break
        }
    }
    // Candidate when: no Flowmatic schema yet (new) OR an existing graph is stale
    // (missing a base node / below current generator version) so it gets enriched.
    // Complete, up-to-date graphs are skipped — still idempotent. Transactional /
    // no-index pages (cart, checkout, thank-you) are skipped entirely.
    const candidates = all.filter(it => (!it.hasOurSchema || it.stale) && !isFunctionalPage(it.link, it.title))
    return { candidates, scanned }
}

// Fetch a single page/post's content body (kept separate from the list scan so
// the heavy Elementor HTML is only pulled for the ≤15 pages we actually process).
// Returns the stripped snippet (for the LLM) AND any real video embeds found in
// the RAW HTML (extracted before stripping — iframe/src survive only in raw).
async function fetchContent(cfg: WpCfg, type: WpContentType, id: number): Promise<{ snippet: string; videos: VideoRef[] }> {
    const base = normalizeUrl(cfg.url)
    try {
        // Page-builder pages (Elementor/Divi/…) keep real content in widgets, so
        // wp/v2 content.rendered is a thin/garbage leftover. Source the snippet
        // from the companion's RENDERED output instead, so their schema (FAQ,
        // primary-entity description) is generated from real content.
        const bi = await getBuilderInfo(cfg, id)
        if (bi?.isBuilder && bi.renderedExcerpt && bi.renderedExcerpt.length > 60) {
            return { snippet: bi.renderedExcerpt.slice(0, 1800), videos: [] }
        }
        const res = await fetchRetry(`${base}/wp-json/wp/v2/${type}/${id}?_fields=content`, {
            headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000),
        })
        if (!res.ok) return { snippet: '', videos: [] }
        const j = await res.json().catch(() => null) as { content?: { rendered?: string } } | null
        const raw = j?.content?.rendered || ''
        return { snippet: stripHtml(raw).slice(0, 1800), videos: detectVideos(raw) }
    } catch { return { snippet: '', videos: [] } }
}

/**
 * Generate one schema.org @graph for a page. Deterministic structural nodes
 * (Organization, WebSite, BreadcrumbList) are assembled in code; the page-type
 * node (Article/WebPage/FAQPage) is LLM-shaped from the content. Returns a
 * compact JSON string, or null on failure.
 */
async function generateSchema(
    apiKey: string, model: string,
    business: { name: string; siteUrl: string; sameAs?: string[] },
    item: SchemaItem,
): Promise<string | null> {
    const prompt = `אתם עורך SEO טכני. צרו את צומת ה-schema.org הספציפי לעמוד הבא (סוג העמוד + FAQ אם קיים). עברית.

עמוד: "${item.title}"
URL: ${item.link}
תקציר: ${item.excerpt}
תוכן (קטע): ${item.contentSnippet}

החזירו JSON בלבד:
{
  "primaryType": "<Article | WebPage | AboutPage | ContactPage | CollectionPage | Product | Service>",
  "primaryNode": { <צומת schema.org תקני עבור primaryType: כולל name/headline, description, inLanguage:'he-IL', url. ל-Article גם datePublished אם ידוע. בלי שדות מומצאים> },
  "faq": [ { "question": "<שאלה מהתוכן>", "answer": "<תשובה קצרה מהתוכן>" } ]
}
חוקים: faq רק אם יש באמת תוכן שאלות/תשובות בעמוד, אחרת []. אל תמציאו עובדות שלא בתוכן.`

    type ParsedSchema = { primaryType?: string; primaryNode?: Record<string, unknown>; faq?: Array<{ question?: string; answer?: string }> }
    // One self-correction retry: LLM-authored JSON-LD is occasionally malformed
    // (trailing comma / unescaped quote in Hebrew strings) → JSON.parse throws.
    // Without a retry the whole page silently loses its schema (hit on page 6811).
    const genOnce = async (extra: string): Promise<ParsedSchema> => {
        const body = { model, max_tokens: 2500, messages: [{ role: 'user', content: prompt + extra }] }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
        })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
        const f = text.indexOf('{'), l = text.lastIndexOf('}')
        if (f < 0 || l < 0) throw new Error('no JSON object in response')
        return JSON.parse(text.substring(f, l + 1)) as ParsedSchema
    }
    let parsed: ParsedSchema
    try {
        try {
            parsed = await genOnce('')
        } catch (e1) {
            console.warn(`[seoSchemaBatch] gen ${item.id} parse failed (${(e1 as Error).message}) — retrying with stricter instruction`)
            parsed = await genOnce('\n\nשימו לב: הפלט הקודם לא היה JSON תקין. החזירו אך ורק אובייקט JSON תקין אחד, ללא טקסט לפני או אחרי, עם מירכאות נמלטות כראוי בתוך מחרוזות.')
        }
    } catch (err) {
        console.warn(`[seoSchemaBatch] gen ${item.id} error (after retry):`, (err as Error).message)
        return null
    }

    return assembleSchemaGraph(business, { title: item.title, link: item.link, excerpt: item.excerpt }, parsed, item.videos)
}

/**
 * Assemble a full schema.org @graph JSON-LD doc from deterministic structural
 * nodes (Organization, WebSite + SearchAction, BreadcrumbList) plus a page-type
 * node and optional FAQPage / VideoObject. Shared by the batch task AND the
 * edit-time enrichment in seoPageRefresh (so a page we just edited gets the SAME
 * complete graph — critical because the companion suppresses Yoast/RankMath
 * schema once `_clawflow_schema_jsonld` is set; a partial graph would LOSE the
 * org/breadcrumb nodes). Works identically for classic and Elementor pages
 * because it takes the content facts as input (no re-read of the page body).
 */
export function assembleSchemaGraph(
    business: { name: string; siteUrl: string; sameAs?: string[] },
    item: { title: string; link: string; excerpt?: string },
    parsed: { primaryType?: string; primaryNode?: Record<string, unknown>; faq?: Array<{ question?: string; answer?: string }> },
    videos: VideoRef[] = [],
): string {
    const base = normalizeUrl(business.siteUrl)
    const path = (() => { try { return new URL(item.link).pathname } catch { return '/' } })()
    const segs = path.split('/').filter(Boolean).map(s => decodeURIComponent(s))
    const breadcrumb = {
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: business.name, item: base + '/' },
            ...(segs.length ? [{ '@type': 'ListItem', position: 2, name: item.title, item: item.link }] : []),
        ],
    }
    const org: Record<string, unknown> = {
        '@type': 'Organization', '@id': base + '/#organization',
        name: business.name, url: base + '/',
    }
    if (business.sameAs && business.sameAs.length) org.sameAs = business.sameAs.slice(0, 10)
    // WebSite node kept as the graph hub (site name + entity binding). The
    // SearchAction / Sitelinks Searchbox was RETIRED by Google 2024-11-21 — it no
    // longer renders anything, so we no longer emit it (dead weight / noise).
    const website = {
        '@type': 'WebSite', '@id': base + '/#website', url: base + '/', name: business.name,
        publisher: { '@id': base + '/#organization' }, inLanguage: 'he-IL',
    }
    const graph: Record<string, unknown>[] = [org, website, breadcrumb]
    if (parsed.primaryNode && typeof parsed.primaryNode === 'object') {
        const node = { ...parsed.primaryNode } as Record<string, unknown>
        if (!node['@type']) node['@type'] = parsed.primaryType || 'WebPage'
        if (!node.url) node.url = item.link
        if (!node.inLanguage) node.inLanguage = 'he-IL'
        node.isPartOf = { '@id': base + '/#website' }
        node.publisher = { '@id': base + '/#organization' }
        graph.push(node)
    }
    if (Array.isArray(parsed.faq) && parsed.faq.length) {
        const valid = parsed.faq.filter(q => q && typeof q.question === 'string' && typeof q.answer === 'string').slice(0, 10)
        if (valid.length) {
            graph.push({
                '@type': 'FAQPage', url: item.link, inLanguage: 'he-IL',
                mainEntity: valid.map(q => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
            })
        }
    }
    for (const v of videos.slice(0, 2)) {
        const node: Record<string, unknown> = {
            '@type': 'VideoObject', name: item.title,
            description: (item.excerpt || item.title).slice(0, 200),
            contentUrl: v.contentUrl, inLanguage: 'he-IL',
        }
        if (v.embedUrl) node.embedUrl = v.embedUrl
        if (v.thumbnailUrl) node.thumbnailUrl = v.thumbnailUrl
        graph.push(node)
    }
    const doc = { '@context': 'https://schema.org', '@graph': graph, _fmSchemaV: SCHEMA_GEN_VERSION }
    return JSON.stringify(doc)
}

async function writeSchema(cfg: WpCfg, item: SchemaItem, jsonLd: string): Promise<void> {
    const base = normalizeUrl(cfg.url)
    const res = await fetchRetry(`${base}/wp-json/wp/v2/${item.type}/${item.id}`, {
        method: 'POST',
        headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: { _clawflow_schema_jsonld: jsonLd } }),
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    // Read back — confirm the companion plugin actually stored it.
    const check = await fetchRetry(`${base}/wp-json/wp/v2/${item.type}/${item.id}?context=edit&_fields=meta`, {
        headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000),
    })
    if (check.ok) {
        const j = await check.json().catch(() => null) as { meta?: Record<string, unknown> } | null
        if (((j?.meta || {})._clawflow_schema_jsonld as string || '') !== jsonLd) {
            throw new Error('schema_not_persisted: WP accepted the write but did not store it — companion plugin v1.9.0+ likely not installed')
        }
    }
}

export async function runSeoSchemaBatch(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; sameAs?: string[]; dryRun?: boolean; onlyIds?: number[] } = {},
): Promise<SeoSchemaBatchResult> {
    const result: SeoSchemaBatchResult = {
        ok: false, integrationMissing: false, authError: false,
        scanned: 0, candidates: 0, updated: [], failures: [],
    }
    const cfg = await loadWpConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }

    let candidates: SchemaItem[]
    try {
        const listed = await listSchemaCandidates(cfg)
        candidates = listed.candidates
        result.scanned = listed.scanned
    } catch (err) { result.error = (err as Error).message; return result }

    if (opts.onlyIds?.length) {
        const allow = new Set(opts.onlyIds)
        candidates = candidates.filter(it => allow.has(it.id))
    }
    result.candidates = candidates.length
    if (candidates.length === 0) { result.ok = true; return result }

    const toProcess = candidates.slice(0, MAX_UPDATES_PER_RUN)
    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key for instance'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const business = { name: opts.businessName || 'העסק', siteUrl: cfg.url, sameAs: opts.sameAs }

    for (const item of toProcess) {
        if (!item.contentSnippet) {
            const { snippet, videos } = await fetchContent(cfg, item.type, item.id)
            item.contentSnippet = snippet
            item.videos = videos
        }
        const jsonLd = await generateSchema(apiKey, model, business, item)
        if (!jsonLd) { result.failures.push({ type: item.type, id: item.id, error: 'no schema generated' }); continue }
        if (opts.dryRun) {
            result.updated.push({ type: item.type, id: item.id, title: item.title, link: item.link, types: schemaTypes(jsonLd), reason: item.reason })
            continue
        }
        try {
            await writeSchema(cfg, item, jsonLd)
            result.updated.push({ type: item.type, id: item.id, title: item.title, link: item.link, types: schemaTypes(jsonLd), reason: item.reason })
        } catch (err) {
            const msg = (err as Error).message
            if (/^(401|403)\b/.test(msg)) result.authError = true
            result.failures.push({ type: item.type, id: item.id, error: msg })
        }
    }
    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}

function schemaTypes(jsonLd: string): string[] {
    try {
        const g = (JSON.parse(jsonLd)['@graph'] || []) as Array<{ '@type'?: string }>
        return g.map(n => String(n['@type'] || '')).filter(Boolean)
    } catch { return [] }
}