/**
 * SEO Image Alt-Text Batch — WordPress media library.
 *
 * Scans the media library for images with an empty `alt_text`, generates a
 * concise Hebrew alt description (grounded in the filename/title + the parent
 * post's title when attached), and writes it back via core REST
 * (POST /wp/v2/media/{id} { alt_text }) — no companion plugin needed, alt_text
 * is a first-class writable field. Themes/Gutenberg/Elementor that reference
 * images by attachment ID render this alt.
 *
 * Invoked by monthlyTaskExecutor's runImageAltAdapter AFTER user task-approval.
 * Idempotent: an image that already has alt_text is skipped.
 */
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'

const MAX_UPDATES_PER_RUN = 25
const MAX_SCAN_PAGES = 5
const GEN_CHUNK = 10

interface MediaItem { id: number; title: string; filename: string; link: string }

export interface ImageAltResult {
    ok: boolean
    integrationMissing: boolean
    authError: boolean
    scanned: number
    candidates: number
    updated: Array<{ id: number; filename: string; altText: string }>
    failures: Array<{ id: number; error: string }>
    error?: string
}

const TRANSIENT = new Set([429, 500, 502, 503, 504, 520, 521, 522, 524])
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
function stripHtml(s: string): string { return String(s || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim() }

async function listImagesMissingAlt(cfg: WpCfg): Promise<{ items: MediaItem[]; scanned: number }> {
    const base = normalizeUrl(cfg.url)
    const items: MediaItem[] = []
    let scanned = 0
    for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
        const url = `${base}/wp-json/wp/v2/media?per_page=100&page=${page}&media_type=image&_fields=id,alt_text,title,source_url,link`
        const res = await fetchRetry(url, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
        if (res.status === 400) break
        if (!res.ok) throw new Error(`WP GET media → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
        const rows = await res.json().catch(() => []) as Array<{ id?: number; alt_text?: string; title?: { rendered?: string }; source_url?: string; link?: string }>
        if (!Array.isArray(rows) || rows.length === 0) break
        for (const r of rows) {
            if (typeof r.id !== 'number') continue
            scanned++
            if ((r.alt_text || '').trim().length > 0) continue   // already has alt — skip
            const filename = (r.source_url || '').split('/').pop() || ''
            items.push({ id: r.id, title: stripHtml(r.title?.rendered || ''), filename, link: r.link || '' })
        }
        if (rows.length < 100) break
    }
    return { items, scanned }
}

async function generateAlts(apiKey: string, model: string, businessName: string, items: MediaItem[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    const list = items.map(it => ({ id: it.id, title: it.title, filename: it.filename }))
    const prompt = `אתם מומחי SEO ונגישות של ${businessName}. עבור כל תמונה, כתבו טקסט חלופי (alt text) בעברית — תיאור קצר וענייני של מה שרואים בתמונה (5-12 מילים), לפי הכותרת/שם הקובץ. בלי "תמונה של", בלי מילות מפתח מאולצות.

תמונות:
${JSON.stringify(list, null, 2)}

JSON בלבד:
{ "alts": [ { "id": <id>, "alt": "<תיאור בעברית>" } ] }`
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
        const parsed = JSON.parse(text.substring(f, l + 1)) as { alts?: Array<{ id?: number; alt?: string }> }
        for (const a of parsed.alts || []) {
            if (typeof a.id === 'number' && typeof a.alt === 'string') {
                const alt = a.alt.trim().replace(/\s+/g, ' ').slice(0, 125)
                if (alt.length >= 3) out.set(a.id, alt)
            }
        }
    } catch { /* best effort */ }
    return out
}

async function writeAlt(cfg: WpCfg, id: number, altText: string): Promise<void> {
    const base = normalizeUrl(cfg.url)
    const res = await fetchRetry(`${base}/wp-json/wp/v2/media/${id}`, {
        method: 'POST',
        headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt_text: altText }),
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
    const check = await fetchRetry(`${base}/wp-json/wp/v2/media/${id}?_fields=alt_text`, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
    if (check.ok) {
        const j = await check.json().catch(() => null) as { alt_text?: string } | null
        if ((j?.alt_text || '') !== altText) throw new Error('alt_not_persisted')
    }
}

export async function runImageAltBatch(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean } = {},
): Promise<ImageAltResult> {
    const result: ImageAltResult = { ok: false, integrationMissing: false, authError: false, scanned: 0, candidates: 0, updated: [], failures: [] }
    const cfg = await loadWpConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }

    let items: MediaItem[]
    try { const listed = await listImagesMissingAlt(cfg); items = listed.items; result.scanned = listed.scanned }
    catch (err) { result.error = (err as Error).message; return result }

    result.candidates = items.length
    if (items.length === 0) { result.ok = true; return result }

    const toProcess = items.slice(0, MAX_UPDATES_PER_RUN)
    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key for instance'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || 'העסק'

    for (let i = 0; i < toProcess.length; i += GEN_CHUNK) {
        const chunk = toProcess.slice(i, i + GEN_CHUNK)
        const alts = await generateAlts(apiKey, model, businessName, chunk)
        for (const it of chunk) {
            const alt = alts.get(it.id)
            if (!alt) { result.failures.push({ id: it.id, error: 'no alt generated' }); continue }
            if (opts.dryRun) { result.updated.push({ id: it.id, filename: it.filename, altText: alt }); continue }
            try { await writeAlt(cfg, it.id, alt); result.updated.push({ id: it.id, filename: it.filename, altText: alt }) }
            catch (err) { const msg = (err as Error).message; if (/^(401|403)\b/.test(msg)) result.authError = true; result.failures.push({ id: it.id, error: msg }) }
        }
    }
    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}