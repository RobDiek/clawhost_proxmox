/**
 * Answer-First retrofit (AEO) — WordPress posts.
 *
 * Prepends a concise, clearly-marked "תשובה קצרה" (direct-answer / TL;DR) block
 * to the top of existing blog posts so answer engines (ChatGPT/Perplexity/
 * Gemini) and Google featured snippets can extract a clean, citable answer.
 *
 * Additive + idempotent: the block carries a `data-clawflow-answer` marker;
 * posts that already have it are skipped. Edits content via core REST + reads
 * back. Posts only (Elementor pages skipped — body lives in shortcodes).
 *
 * Invoked by runAnswerFirstAdapter AFTER user task-approval.
 */
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'

const MAX_POSTS_PER_RUN = 15
const MAX_SCAN_PAGES = 5
const MARKER = 'data-clawflow-answer'

interface PostItem { id: number; title: string }

export interface AnswerFirstResult {
    ok: boolean
    integrationMissing: boolean
    authError: boolean
    scanned: number
    candidates: number
    updated: Array<{ id: number; title: string; answer: string }>
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
function stripHtml(s: string): string { return String(s || '').replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim() }

async function listPosts(cfg: WpCfg): Promise<{ items: PostItem[]; scanned: number }> {
    const base = normalizeUrl(cfg.url)
    const items: PostItem[] = []
    let scanned = 0
    for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
        const url = `${base}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish&_fields=id,title`
        const res = await fetchRetry(url, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
        if (res.status === 400 || !res.ok) break
        const rows = await res.json().catch(() => []) as Array<{ id?: number; title?: { rendered?: string } }>
        if (!Array.isArray(rows) || rows.length === 0) break
        for (const r of rows) { if (typeof r.id === 'number') { scanned++; items.push({ id: r.id, title: stripHtml(r.title?.rendered || '') }) } }
        if (rows.length < 100) break
    }
    return { items, scanned }
}

async function fetchRaw(cfg: WpCfg, id: number): Promise<{ raw: string; isElementor: boolean } | null> {
    const base = normalizeUrl(cfg.url)
    const res = await fetchRetry(`${base}/wp-json/wp/v2/posts/${id}?context=edit&_fields=content`, { headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(30000) })
    if (!res.ok) return null
    const j = await res.json().catch(() => null) as { content?: { raw?: string } } | null
    const raw = j?.content?.raw
    if (typeof raw !== 'string') return null
    return { raw, isElementor: /data-elementor|\[elementor/i.test(raw) || raw.trim() === '' }
}

async function generateAnswer(apiKey: string, model: string, businessName: string, title: string, snippet: string): Promise<string> {
    const prompt = `אתם עורך תוכן של ${businessName}. כתבו "תשובה קצרה" ישירה בעברית (2-3 משפטים, 35-60 מילים) לשאלה המשתמעת מכותרת המאמר — תשובה שמנוע AI או Google יוכלו לצטט כפסקת תשובה. ישיר, עובדתי, בלי הקדמות.

כותרת: ${title}
קטע מהתוכן: ${snippet}

החזירו JSON בלבד: {"answer":"<תשובה קצרה בעברית>"}`
    const res = await fetchRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return ''
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
    const text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
    const f = text.indexOf('{'), l = text.lastIndexOf('}')
    if (f < 0 || l < 0) return ''
    try { return String((JSON.parse(text.substring(f, l + 1)) as { answer?: string }).answer || '').trim() } catch { return '' }
}

function prependAnswer(raw: string, answer: string): string {
    const block = `<div ${MARKER}="1" style="border-inline-start:4px solid #2563EB;padding:12px 16px;margin:0 0 20px;background:#f1f5f9;border-radius:6px"><strong>תשובה קצרה:</strong> ${answer}</div>\n\n`
    // Insert after the first heading if present, else at the very top.
    const hMatch = raw.match(/<\/h[1-3]>/i)
    if (hMatch && typeof hMatch.index === 'number') {
        const pos = hMatch.index + hMatch[0].length
        return raw.slice(0, pos) + '\n' + block + raw.slice(pos)
    }
    return block + raw
}

export async function runAnswerFirst(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean; onlyIds?: number[] } = {},
): Promise<AnswerFirstResult> {
    const result: AnswerFirstResult = { ok: false, integrationMissing: false, authError: false, scanned: 0, candidates: 0, updated: [], failures: [] }
    const cfg = await loadWpConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }

    let posts: PostItem[]
    try { const l = await listPosts(cfg); posts = l.items; result.scanned = l.scanned }
    catch (err) { result.error = (err as Error).message; return result }
    if (opts.onlyIds?.length) { const a = new Set(opts.onlyIds); posts = posts.filter(p => a.has(p.id)) }
    result.candidates = posts.length
    if (posts.length === 0) { result.ok = true; return result }

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || 'העסק'

    let processed = 0
    for (const post of posts) {
        if (processed >= MAX_POSTS_PER_RUN) break
        try {
            const content = await fetchRaw(cfg, post.id)
            if (!content || content.isElementor) continue
            if (content.raw.includes(MARKER)) continue   // idempotent — already has answer block
            processed++
            const snippet = stripHtml(content.raw).slice(0, 800)
            const answer = await generateAnswer(apiKey, model, businessName, post.title, snippet)
            if (answer.length < 20) { result.failures.push({ id: post.id, error: 'no answer generated' }); continue }
            const newRaw = prependAnswer(content.raw, answer)
            if (opts.dryRun) { result.updated.push({ id: post.id, title: post.title, answer }); continue }
            const base = normalizeUrl(cfg.url)
            const res = await fetchRetry(`${base}/wp-json/wp/v2/posts/${post.id}`, {
                method: 'POST', headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newRaw }), signal: AbortSignal.timeout(45000),
            })
            if (!res.ok) { const m = `${res.status}`; if (/^(401|403)/.test(m)) result.authError = true; result.failures.push({ id: post.id, error: m }); continue }
            const verify = await fetchRaw(cfg, post.id)
            if (!verify || !verify.raw.includes(MARKER)) { result.failures.push({ id: post.id, error: 'answer_not_persisted' }); continue }
            result.updated.push({ id: post.id, title: post.title, answer })
        } catch (err) { result.failures.push({ id: post.id, error: (err as Error).message }) }
    }
    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}