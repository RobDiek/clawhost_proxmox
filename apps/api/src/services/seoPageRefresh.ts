/**
 * SEO Page Refresh — update EXISTING WordPress posts/pages: expand thin content,
 * add question-format H2 headings + an FAQ block, deepen toward a target length,
 * while preserving the existing facts, links and structure.
 *
 * Closes the gap where content.create only makes NEW articles. The plan's
 * "רענון 17 דפים", "הרחבת 35 דפים תוכן דק", "רענון דף עוגן 325→1,200" tasks are
 * about improving pages that already exist — not creating new ones.
 *
 * Target selection (priority):
 *   1. Explicit page title/phrase named in the task (WP ?search=).
 *   2. Thin-content scan — posts/pages under THIN_WORD_THRESHOLD words.
 * (GSC position 4-15 targeting is a future add; falls back to thin-content.)
 *
 * Per target: fetch content (context=edit) → Claude expands it (Hebrew, keep
 * existing, add depth + H2 questions + FAQ) toward the word target → write back
 * via WP REST. Idempotent: pages already ≥ target are skipped unless named.
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'

const THIN_WORD_THRESHOLD = 300
const DEFAULT_TARGET_WORDS = 1000
const MAX_REFRESH_PER_RUN = 10
const MAX_SCAN_PAGES = 5

export interface PageRefreshResult {
    ok: boolean
    integrationMissing: boolean
    authError: boolean
    scanned: number
    candidates: number
    targetWords: number
    updated: Array<{ type: string; id: number; title: string; link: string; beforeWords: number; afterWords: number }>
    failures: Array<{ type: string; id: number; error: string }>
    error?: string
}

type WpType = 'posts' | 'pages'
interface WpCfg { url: string; user: string; appPassword: string }
const norm = (u: string) => u.replace(/\/+$/, '')
const auth = (c: WpCfg) => 'Basic ' + Buffer.from(`${c.user}:${c.appPassword}`).toString('base64')
const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ')
const wordCount = (h: string) => stripHtml(h).trim().split(/\s+/).filter(Boolean).length

interface Target { type: WpType; id: number; title: string; link: string; content: string; words: number }

// Pull the word target from the task text if it states one (e.g. "→ 1,200",
// "ל-1200 מילים", "1,500 מילים"). Else default.
export function parseTargetWords(text: string): number {
    const arrow = text.match(/(?:→|ל-?|עד)\s*([\d,]{3,6})\s*מילים?/)
    if (arrow) { const n = parseInt(arrow[1].replace(/,/g, ''), 10); if (n >= 300 && n <= 5000) return n }
    const any = text.match(/([\d,]{3,6})\s*מילים/)
    if (any) { const n = parseInt(any[1].replace(/,/g, ''), 10); if (n >= 500 && n <= 5000) return n }
    return DEFAULT_TARGET_WORDS
}

async function fetchType(cfg: WpCfg, type: WpType, search?: string): Promise<Target[]> {
    const out: Target[] = []
    const base = norm(cfg.url)
    for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
        const q = search ? `&search=${encodeURIComponent(search)}` : ''
        const url = `${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&context=edit&_fields=id,title,link,content${q}`
        const res = await fetch(url, { headers: { Authorization: auth(cfg) }, signal: AbortSignal.timeout(30000) })
        if (res.status === 400) break
        if (!res.ok) throw new Error(`WP GET ${type} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
        const items = await res.json().catch(() => []) as any[]
        if (!Array.isArray(items) || items.length === 0) break
        for (const it of items) {
            if (typeof it.id !== 'number') continue
            const html = it.content?.raw || it.content?.rendered || ''
            out.push({
                type, id: it.id,
                title: stripHtml(it.title?.rendered || it.title?.raw || `#${it.id}`).trim(),
                link: it.link || '', content: html, words: wordCount(html),
            })
        }
        if (items.length < 100 || search) break
    }
    return out
}

/** Claude expands an existing page toward the word target. Returns new HTML or null. */
async function expandContent(apiKey: string, model: string, businessName: string, t: Target, targetWords: number): Promise<string | null> {
    const prompt = `אתם עורך תוכן SEO בכיר של ${businessName}. לפניכם עמוד קיים שצריך להעמיק ולהרחיב — לא לכתוב מחדש מאפס, אלא לשמר את כל המידע, הקישורים והעובדות הקיימים, ולהוסיף עומק.

## העמוד הקיים
כותרת: ${t.title}
אורך נוכחי: ${t.words} מילים. יעד: ${targetWords} מילים.
תוכן HTML נוכחי:
${t.content.slice(0, 12000)}

## מה לעשות
- שמרו את כל התוכן, הקישורים והעובדות הקיימים. הרחיבו, אל תמחקו.
- הוסיפו 2-4 כותרות משנה H2 בפורמט שאלה (כמו שמשתמשים מקלידים בגוגל).
- העמיקו כל סעיף עם פרטים פרקטיים, דוגמאות וערך אמיתי לקורא.
- הוסיפו בסוף מקטע "שאלות נפוצות" עם 3-5 שאלות ותשובות (H2 "שאלות נפוצות" ואז שאלות ב-H3).
- עברית בלבד (חוץ משמות מותג רשמיים). טון ענייני, מקצועי, ידידותי. פנייה בלשון רבים.
- הגיעו לכ-${targetWords} מילים.

## תפוקה
החזירו אך ורק HTML תקין של גוף העמוד החדש (פסקאות <p>, כותרות <h2>/<h3>, רשימות <ul>/<li> לפי הצורך). בלי markdown, בלי \`\`\`, בלי טקסט הסבר לפני או אחרי.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(180000),
    })
    if (!res.ok) { console.warn(`[seoPageRefresh] expand API ${res.status}`); return null }
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
    let html = (data.content?.find(c => c.type === 'text')?.text || '').trim()
    html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim()
    if (wordCount(html) < Math.max(t.words, THIN_WORD_THRESHOLD)) return null   // didn't actually expand
    return html
}

async function writeContent(cfg: WpCfg, t: Target, html: string): Promise<void> {
    const res = await fetch(`${norm(cfg.url)}/wp-json/wp/v2/${t.type}/${t.id}`, {
        method: 'POST',
        headers: { Authorization: auth(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: html }),
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

export async function runPageRefresh(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; targetWords?: number; namedPages?: string[]; dryRun?: boolean } = {},
): Promise<PageRefreshResult> {
    const result: PageRefreshResult = { ok: false, integrationMissing: false, authError: false, scanned: 0, candidates: 0, targetWords: opts.targetWords || DEFAULT_TARGET_WORDS, updated: [], failures: [] }
    const cfg = await loadWpConfig(instanceId, opts.agentId) as WpCfg | null
    if (!cfg) { result.integrationMissing = true; return result }

    // 1) Resolve targets
    let targets: Target[] = []
    try {
        if (opts.namedPages && opts.namedPages.length) {
            for (const phrase of opts.namedPages.slice(0, MAX_REFRESH_PER_RUN)) {
                const found = [...await fetchType(cfg, 'posts', phrase), ...await fetchType(cfg, 'pages', phrase)]
                if (found[0]) targets.push(found[0])
            }
        } else {
            const all = [...await fetchType(cfg, 'posts'), ...await fetchType(cfg, 'pages')]
            result.scanned = all.length
            targets = all.filter(t => t.words < THIN_WORD_THRESHOLD).sort((a, b) => a.words - b.words)
        }
    } catch (err) { result.error = (err as Error).message; return result }

    result.candidates = targets.length
    if (targets.length === 0) { result.ok = true; return result }   // idempotent no-op
    targets = targets.slice(0, MAX_REFRESH_PER_RUN)

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key for instance'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || 'העסק'
    const targetWords = opts.targetWords || DEFAULT_TARGET_WORDS
    result.targetWords = targetWords

    for (const t of targets) {
        try {
            const html = await expandContent(apiKey, model, businessName, t, targetWords)
            if (!html) { result.failures.push({ type: t.type, id: t.id, error: 'expansion did not increase length' }); continue }
            if (!opts.dryRun) await writeContent(cfg, t, html)
            result.updated.push({ type: t.type, id: t.id, title: t.title, link: t.link, beforeWords: t.words, afterWords: wordCount(html) })
        } catch (err) {
            const msg = (err as Error).message
            if (/^(401|403)\b/.test(msg)) result.authError = true
            result.failures.push({ type: t.type, id: t.id, error: msg })
        }
    }
    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}