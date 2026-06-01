/**
 * SEO Slug Proposal (propose-only) — WordPress.
 *
 * Per Sergei's choice (2026-06-01): PROPOSE only, never auto-change URLs of
 * existing (potentially ranking) pages. We find pages/posts whose slug is a
 * %-encoded Hebrew string (ugly, non-portable URLs), generate a clean Latin
 * slug suggestion (translation-based, as good IL sites do), and return a brief
 * with the suggested slug + the 301 redirect the user would create. NO writes.
 *
 * Surfaced via runSlugProposeAdapter → a manual brief (awaiting_manual).
 */
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'

const MAX_SUGGESTIONS = 20
const MAX_SCAN_PAGES = 5
const GEN_CHUNK = 10

type WpContentType = 'posts' | 'pages'

interface SlugItem {
    type: WpContentType
    id: number
    title: string
    link: string
    currentSlug: string
}

export interface SlugProposal {
    type: WpContentType
    id: number
    title: string
    oldUrl: string
    currentSlug: string
    suggestedSlug: string
    newUrl: string
}

export interface SlugProposeResult {
    ok: boolean
    integrationMissing: boolean
    scanned: number
    candidates: number
    proposals: SlugProposal[]
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
        } catch (err) { lastErr = err as Error; if (i < tries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1))) }
    }
    if (lastErr) throw lastErr
    throw new Error('fetchRetry exhausted')
}
function authHeader(cfg: WpCfg): string { return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64') }
function normalizeUrl(url: string): string { return url.replace(/\/+$/, '') }
function cleanSlug(s: string): string {
    return String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}
// A slug "needs work" when it's percent-encoded or contains non-ASCII (Hebrew).
function isUglySlug(slug: string): boolean {
    return /%[0-9a-f]{2}/i.test(slug) || /[-￿]/.test(slug)   // %-encoded or non-ASCII (Hebrew)
}

async function listUglySlugItems(cfg: WpCfg): Promise<{ items: SlugItem[]; scanned: number }> {
    const base = normalizeUrl(cfg.url)
    const items: SlugItem[] = []
    let scanned = 0
    for (const type of ['posts', 'pages'] as WpContentType[]) {
        for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
            const url = `${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=id,title,link,slug`
            const res = await fetchRetry(url, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
            if (res.status === 400) break
            if (!res.ok) throw new Error(`WP GET ${type} → ${res.status}`)
            const rows = await res.json().catch(() => []) as Array<{ id?: number; title?: { rendered?: string }; link?: string; slug?: string }>
            if (!Array.isArray(rows) || rows.length === 0) break
            for (const r of rows) {
                if (typeof r.id !== 'number') continue
                scanned++
                const slug = String(r.slug || '')
                // r.slug from REST is already decoded; the LINK shows %-encoding.
                const linkSlug = (() => { try { return decodeURIComponent(new URL(r.link || '').pathname) } catch { return r.link || '' } })()
                if (isUglySlug(slug) || isUglySlug(r.link || '') || isUglySlug(linkSlug)) {
                    items.push({ type, id: r.id, title: (r.title?.rendered || '').replace(/<[^>]*>/g, '').trim(), link: r.link || '', currentSlug: slug })
                }
            }
            if (rows.length < 100) break
        }
    }
    return { items, scanned }
}

async function generateSlugs(apiKey: string, model: string, items: SlugItem[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    const list = items.map(it => ({ id: it.id, title: it.title }))
    const prompt = `Generate clean, SEO-friendly English URL slugs from these Hebrew page titles. Translate the core meaning to short English (2-5 words). lowercase, hyphens, a-z0-9 only.

Titles:
${JSON.stringify(list, null, 2)}

Return JSON only:
{ "slugs": [ { "id": <id>, "slug": "<english-slug>" } ] }`
    try {
        const res = await fetchRetry('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
            signal: AbortSignal.timeout(120000),
        })
        if (!res.ok) return out
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
        const f = text.indexOf('{'), l = text.lastIndexOf('}')
        if (f < 0 || l < 0) return out
        const parsed = JSON.parse(text.substring(f, l + 1)) as { slugs?: Array<{ id?: number; slug?: string }> }
        for (const s of parsed.slugs || []) {
            if (typeof s.id === 'number' && typeof s.slug === 'string') {
                const clean = cleanSlug(s.slug)
                if (clean.length >= 3) out.set(s.id, clean)
            }
        }
    } catch { /* best effort */ }
    return out
}

export async function proposeSlugs(
    instanceId: string,
    opts: { agentId?: string | null } = {},
): Promise<SlugProposeResult> {
    const result: SlugProposeResult = { ok: false, integrationMissing: false, scanned: 0, candidates: 0, proposals: [] }
    const cfg = await loadWpConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }

    let items: SlugItem[]
    try {
        const listed = await listUglySlugItems(cfg)
        items = listed.items
        result.scanned = listed.scanned
    } catch (err) { result.error = (err as Error).message; return result }

    result.candidates = items.length
    if (items.length === 0) { result.ok = true; return result }

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key for instance'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const base = normalizeUrl(cfg.url)
    const toProcess = items.slice(0, MAX_SUGGESTIONS)

    for (let i = 0; i < toProcess.length; i += GEN_CHUNK) {
        const chunk = toProcess.slice(i, i + GEN_CHUNK)
        const slugs = await generateSlugs(apiKey, model, chunk)
        for (const it of chunk) {
            const suggested = slugs.get(it.id)
            if (!suggested) continue
            result.proposals.push({
                type: it.type, id: it.id, title: it.title,
                oldUrl: it.link, currentSlug: it.currentSlug,
                suggestedSlug: suggested,
                newUrl: `${base}/${suggested}/`,
            })
        }
    }
    result.ok = true
    return result
}