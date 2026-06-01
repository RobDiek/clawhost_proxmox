/**
 * SEO Internal Linking (conservative auto) — WordPress.
 *
 * Per Sergei's choice (2026-06-01): conservative. For each blog POST we insert
 * at most LINKS_PER_POST contextual internal links pointing at OTHER pages,
 * and ONLY where that target page's anchor phrase ALREADY appears verbatim in
 * the post body — so the anchor is natural and we never fabricate awkward
 * sentences. We never self-link, never link inside an existing <a>, heading,
 * shortcode, or HTML attribute, and skip a target already linked from the post.
 *
 * Safety scope: POSTS only (classic/Gutenberg HTML in content.raw). Elementor
 * pages store their body in shortcodes/meta, so editing content.raw there is
 * unsafe — those are skipped.
 *
 * Invoked by monthlyTaskExecutor's runInternalLinksAdapter AFTER the user has
 * approved the task ([[feedback_no_automatic_actions]]). Writes content via the
 * core REST `content` field (already writable — no companion plugin needed) and
 * reads back to confirm the links landed.
 */
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'

const LINKS_PER_POST = 3
const MAX_POSTS_PER_RUN = 15
const MAX_SCAN_PAGES = 5
const MIN_ANCHOR_LEN = 12     // skip very short phrases — too generic / risky

type WpContentType = 'posts' | 'pages'

interface CorpusEntry {
    id: number
    type: WpContentType
    title: string
    link: string
    anchor: string             // normalized title used as the anchor phrase to match
}

export interface InternalLinksResult {
    ok: boolean
    integrationMissing: boolean
    authError: boolean
    scanned: number
    candidates: number
    updated: Array<{ id: number; title: string; link: string; inserted: Array<{ anchor: string; toUrl: string }> }>
    failures: Array<{ id: number; error: string }>
    error?: string
}

const TRANSIENT = new Set([429, 502, 503, 504, 520, 521, 522, 524])
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
    let lastErr: Error | null = null
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, init)
            if (TRANSIENT.has(res.status) && i < tries - 1) { await new Promise(r => setTimeout(r, 1500 * (i + 1))); continue }
            return res
        } catch (err) {
            lastErr = err as Error
            if (i < tries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)))
        }
    }
    if (lastErr) throw lastErr
    throw new Error('fetchRetry exhausted')
}

function authHeader(cfg: WpCfg): string { return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64') }
function normalizeUrl(url: string): string { return url.replace(/\/+$/, '') }
function decodeEntities(s: string): string {
    return String(s || '').replace(/&#8217;|&#039;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#8211;|&#8212;/g, '-').replace(/\s+/g, ' ').trim()
}
function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/**
 * Build the link corpus (all published posts+pages) — light fields only.
 */
async function buildCorpus(cfg: WpCfg): Promise<{ corpus: CorpusEntry[]; scanned: number }> {
    const base = normalizeUrl(cfg.url)
    const corpus: CorpusEntry[] = []
    let scanned = 0
    for (const type of ['posts', 'pages'] as WpContentType[]) {
        for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
            const url = `${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=id,title,link`
            const res = await fetchRetry(url, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
            if (res.status === 400) break
            if (!res.ok) throw new Error(`WP GET ${type} → ${res.status}`)
            const items = await res.json().catch(() => []) as Array<{ id?: number; title?: { rendered?: string }; link?: string }>
            if (!Array.isArray(items) || items.length === 0) break
            for (const it of items) {
                if (typeof it.id !== 'number' || !it.link) continue
                scanned++
                const title = decodeEntities(it.title?.rendered || '')
                // Anchor = the core topic phrase (before a ':' / '–' / '|' / '?'),
                // which reads naturally and is far likelier to appear verbatim in
                // another post than the full marketing title. Fall back to full title.
                const core = title.split(/[:–—|?!]/)[0].trim()
                const anchor = core.length >= MIN_ANCHOR_LEN ? core : title
                if (anchor.length >= MIN_ANCHOR_LEN) {
                    corpus.push({ id: it.id, type, title, link: it.link, anchor })
                }
            }
            if (items.length < 100) break
        }
    }
    return { corpus, scanned }
}

/**
 * Split HTML into segments, marking which are "linkable" body text vs protected
 * (inside tags, existing <a>…</a>, headings, scripts, shortcodes). We only ever
 * insert anchors into linkable text segments.
 */
function linkableSegments(html: string): Array<{ text: string; linkable: boolean }> {
    const segs: Array<{ text: string; linkable: boolean }> = []
    // Protected spans: tags, anchors (with content), headings (with content),
    // scripts/styles, and [shortcodes].
    const protectedRe = /<a\b[\s\S]*?<\/a>|<h[1-6]\b[\s\S]*?<\/h[1-6]>|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>|\[[^\]]+\]/gi
    let last = 0
    let m: RegExpExecArray | null
    while ((m = protectedRe.exec(html)) !== null) {
        if (m.index > last) segs.push({ text: html.slice(last, m.index), linkable: true })
        segs.push({ text: m[0], linkable: false })
        last = m.index + m[0].length
    }
    if (last < html.length) segs.push({ text: html.slice(last), linkable: true })
    return segs
}

/**
 * Insert up to LINKS_PER_POST internal links into a post's raw HTML. Returns the
 * new HTML + the list of links inserted. Only links anchor phrases that appear
 * verbatim in linkable body text, first occurrence each, never duplicating a
 * target already linked anywhere in the post.
 */
function insertLinks(rawHtml: string, post: CorpusEntry, corpus: CorpusEntry[]): { html: string; inserted: Array<{ anchor: string; toUrl: string }> } {
    const inserted: Array<{ anchor: string; toUrl: string }> = []
    // Targets = other entries, longer anchors first (more specific = better link).
    const targets = corpus
        .filter(t => t.id !== post.id && t.link !== post.link)
        .sort((a, b) => b.anchor.length - a.anchor.length)

    let segs = linkableSegments(rawHtml)
    const alreadyLinkedUrls = new Set<string>()
    // Pre-seed with URLs already linked in the post so we don't double-link.
    for (const lm of rawHtml.matchAll(/href=["']([^"']+)["']/gi)) alreadyLinkedUrls.add(lm[1].replace(/\/+$/, ''))

    for (const t of targets) {
        if (inserted.length >= LINKS_PER_POST) break
        const targetUrl = t.link.replace(/\/+$/, '')
        if (alreadyLinkedUrls.has(targetUrl)) continue
        const anchorRe = new RegExp(`(^|[\\s(>,.;:"'])(${escapeRegExp(t.anchor)})(?=[\\s).,;:"'<]|$)`)
        // Find the first linkable segment containing the anchor phrase.
        let done = false
        for (let i = 0; i < segs.length && !done; i++) {
            if (!segs[i].linkable) continue
            const mm = anchorRe.exec(segs[i].text)
            if (!mm) continue
            const before = segs[i].text.slice(0, mm.index)
            const lead = mm[1]
            const phrase = mm[2]
            const after = segs[i].text.slice(mm.index + mm[0].length)
            const anchorHtml = `<a href="${t.link}">${phrase}</a>`
            // Replace this segment with three: before+lead (linkable), the anchor
            // (protected), and after (still linkable for subsequent targets).
            segs = [
                ...segs.slice(0, i),
                { text: before + lead, linkable: true },
                { text: anchorHtml, linkable: false },
                { text: after, linkable: true },
                ...segs.slice(i + 1),
            ]
            inserted.push({ anchor: phrase, toUrl: t.link })
            alreadyLinkedUrls.add(targetUrl)
            done = true
        }
    }
    return { html: segs.map(s => s.text).join(''), inserted }
}

async function fetchRawContent(cfg: WpCfg, id: number): Promise<{ raw: string; isElementor: boolean } | null> {
    const base = normalizeUrl(cfg.url)
    const res = await fetchRetry(`${base}/wp-json/wp/v2/posts/${id}?context=edit&_fields=content,meta`, {
        headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return null
    const j = await res.json().catch(() => null) as { content?: { raw?: string }; meta?: Record<string, unknown> } | null
    const raw = j?.content?.raw
    if (typeof raw !== 'string') return null
    const isElementor = /data-elementor|<!-- wp:elementor|\[elementor/i.test(raw) || raw.trim() === ''
    return { raw, isElementor }
}

async function writeContent(cfg: WpCfg, id: number, html: string): Promise<void> {
    const base = normalizeUrl(cfg.url)
    const res = await fetchRetry(`${base}/wp-json/wp/v2/posts/${id}`, {
        method: 'POST',
        headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: html }),
        signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

export async function runInternalLinks(
    instanceId: string,
    opts: { agentId?: string | null; dryRun?: boolean; onlyIds?: number[] } = {},
): Promise<InternalLinksResult> {
    const result: InternalLinksResult = {
        ok: false, integrationMissing: false, authError: false,
        scanned: 0, candidates: 0, updated: [], failures: [],
    }
    const cfg = await loadWpConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }

    let corpus: CorpusEntry[]
    try {
        const built = await buildCorpus(cfg)
        corpus = built.corpus
        result.scanned = built.scanned
    } catch (err) { result.error = (err as Error).message; return result }

    // Candidates = posts only (safe to edit content.raw). Optionally scoped.
    let postTargets = corpus.filter(e => e.type === 'posts')
    if (opts.onlyIds?.length) {
        const allow = new Set(opts.onlyIds)
        postTargets = postTargets.filter(e => allow.has(e.id))
    }
    result.candidates = postTargets.length
    if (postTargets.length === 0) { result.ok = true; return result }

    for (const post of postTargets.slice(0, MAX_POSTS_PER_RUN)) {
        try {
            const content = await fetchRawContent(cfg, post.id)
            if (!content) { result.failures.push({ id: post.id, error: 'could not read content.raw' }); continue }
            if (content.isElementor) { continue }  // skip Elementor — unsafe to edit body
            const { html, inserted } = insertLinks(content.raw, post, corpus)
            if (inserted.length === 0) continue     // nothing natural to link — leave untouched
            if (opts.dryRun) {
                result.updated.push({ id: post.id, title: post.title, link: post.link, inserted })
                continue
            }
            await writeContent(cfg, post.id, html)
            // Read back — confirm at least one inserted href is present.
            const verify = await fetchRawContent(cfg, post.id)
            const persisted = !!verify && inserted.some(ins => verify.raw.includes(`href="${ins.toUrl}"`))
            if (!persisted) { result.failures.push({ id: post.id, error: 'links_not_persisted' }); continue }
            result.updated.push({ id: post.id, title: post.title, link: post.link, inserted })
        } catch (err) {
            const msg = (err as Error).message
            if (/^(401|403)\b/.test(msg)) result.authError = true
            result.failures.push({ id: post.id, error: msg })
        }
    }
    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}