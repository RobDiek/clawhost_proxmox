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
import { assembleSchemaGraph } from '@/services/seoSchemaBatch'
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
    updated: Array<{ type: string; id: number; title: string; link: string; beforeWords: number; afterWords: number; draftHtml?: string; writeMode?: WriteMode; builder?: string; seo?: EditSeo }>
    failures: Array<{ type: string; id: number; error: string }>
    skipped?: Array<{ type: string; id: number; title: string; reason: string }>
    error?: string
}

// Edit-time SEO/AEO technicals applied alongside a content edit — so a page we
// refresh also gets the structured data, meta description and internal links it
// needs, instead of just more body text. (Closes the "FAQ without FAQPage / empty
// meta description" gap surfaced on the MS /blog/ page.)
export interface EditSeo {
    faqCount: number
    schemaTypes: string[]
    schemaWritten?: boolean
    metaDescription?: string
    internalLinks?: number
    errors?: string[]
}

type WpType = 'posts' | 'pages'
type WriteMode = 'post_content' | 'elementor_append'
interface WpCfg { url: string; user: string; appPassword: string }
const norm = (u: string) => u.replace(/\/+$/, '')
const auth = (c: WpCfg) => 'Basic ' + Buffer.from(`${c.user}:${c.appPassword}`).toString('base64')
const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ')
const wordCount = (h: string) => stripHtml(h).trim().split(/\s+/).filter(Boolean).length

interface Target { type: WpType; id: number; title: string; link: string; content: string; words: number }

// ── Page-builder awareness ──────────────────────────────────────────────────
// A page built with Elementor/Divi/etc. keeps its real content in widgets, NOT
// in post_content (which holds only a thin leftover). Appending SEO text into
// post_content there is useless or breaks the render. We ask the companion
// plugin how each page is built (and the RENDERED word count, so "thin" is
// judged on the real content), then route writes accordingly.
interface BuilderInfo {
    ok: boolean
    builder: string                 // 'classic'|'gutenberg'|'elementor'|'divi'|'wpbakery'|'beaver'
    isBuilder: boolean
    isFrontPage: boolean
    renderedWords: number
    renderedExcerpt: string
    canAppend: boolean
}

/** Ask the companion plugin how a page is built. null = companion absent/unreachable. */
async function companionBuilderInfo(cfg: WpCfg, postId: number): Promise<BuilderInfo | null> {
    try {
        const res = await fetch(`${norm(cfg.url)}/wp-json/clawflow/v1/builder-info?post_id=${postId}`, {
            headers: { Authorization: auth(cfg) }, signal: AbortSignal.timeout(25000),
        })
        if (res.status === 404) return null   // companion not installed / too old
        if (!res.ok) return null
        const j = await res.json().catch(() => null) as any
        if (!j || !j.ok) return null
        return {
            ok: true,
            builder: String(j.builder || 'classic'),
            isBuilder: !!j.is_builder,
            isFrontPage: !!j.is_front_page,
            renderedWords: Number(j.rendered_words || 0),
            renderedExcerpt: String(j.rendered_excerpt || ''),
            canAppend: !!j.can_append,
        }
    } catch { return null }
}

/** Native Elementor append via the companion Document API. */
async function elementorAppend(cfg: WpCfg, postId: number, html: string): Promise<{ ok: boolean; newWords?: number; error?: string }> {
    try {
        const res = await fetch(`${norm(cfg.url)}/wp-json/clawflow/v1/elementor-append`, {
            method: 'POST',
            headers: { Authorization: auth(cfg), 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: postId, html }),
            signal: AbortSignal.timeout(45000),
        })
        if (!res.ok) return { ok: false, error: `${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` }
        const j = await res.json().catch(() => ({})) as any
        return { ok: !!j.ok, newWords: Number(j.new_rendered_words || 0) }
    } catch (err) { return { ok: false, error: (err as Error).message } }
}

/** Content-signature builder guess for when the companion plugin is absent. */
function builderFromContent(html: string): string {
    const h = html || ''
    if (/data-elementor-type|elementor-element|class="elementor/i.test(h)) return 'elementor'
    if (/\[vc_row|\[vc_column/i.test(h)) return 'wpbakery'
    if (/et_pb_section|et_pb_row/i.test(h)) return 'divi'
    if (/fl-builder|fl-row-content/i.test(h)) return 'beaver'
    if (/<!--\s*wp:/.test(h)) return 'gutenberg'
    return 'classic'
}

// System / functional pages must NEVER be "expanded" with SEO content — cart,
// checkout, account, shop, thank-you, contact, accessibility, blog index, etc.
// Detected by slug, title, or (most robustly) a functional shortcode/block in
// the body (WooCommerce + form pages always carry these).
const SYSTEM_SLUG = /^(cart|checkout|my-account|account|shop|store|thank-?you|order-received|wishlist|login|log-in|register|lost-password|basket|wc-|sample-page|blog|home|homepage|front-page)$/i
const SYSTEM_TITLE = /סל קניות|עגלת קניות|סיכום רכישה|תשלום|קופה|החשבון שלי|התחבר|הרשמ|נגישות|צור קשר|צרו קשר|יצירת קשר|מדיניות פרטיות|פרטיות|תקנון|תנאי שימוש|תודה|דף הבית|^בלוג$|^חנות$/
const FUNCTIONAL_SHORTCODE = /\[(woocommerce_|product[s_]|add_to_cart|sale_products|featured_products|contact-form-7|wpforms|gravityform|ninja_form|cart|checkout|my_account|account)/i

function isSystemPage(t: Target): boolean {
    const slug = decodeURIComponent((t.link.match(/\/([^/]+)\/?$/)?.[1] || '')).toLowerCase()
    if (SYSTEM_SLUG.test(slug)) return true
    if (SYSTEM_TITLE.test((t.title || '').trim())) return true
    if (FUNCTIONAL_SHORTCODE.test(t.content || '')) return true
    return false
}

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

/**
 * Claude generates the new body. Two modes:
 *  - 'replace' (classic/post_content): preserve all existing content + deepen
 *    toward the word target → returns the FULL new body.
 *  - 'append' (Elementor): the existing content stays in its widgets untouched;
 *    we generate ADDITIONAL, complementary sections to add BELOW it (no repeats).
 * Returns new HTML or null if it didn't actually produce enough content.
 */
async function expandContent(apiKey: string, model: string, businessName: string, t: Target, targetWords: number, mode: WriteMode = 'post_content'): Promise<string | null> {
    const prompt = mode === 'elementor_append'
        ? `אתם עורך תוכן SEO בכיר של ${businessName}. לעמוד הקיים כבר יש תוכן (שנבנה בבונה אתרים Elementor), והוא יישאר כמו שהוא. המשימה: לכתוב מקטע תוכן SEO **חדש ומשלים** שיתווסף **מתחת** לתוכן הקיים — בלי לחזור על מה שכבר נאמר.

## העמוד הקיים (לעיון בלבד — אל תשכפלו אותו)
כותרת: ${t.title}
תוכן קיים (מקוצר):
${t.content.slice(0, 8000)}

## מה לכתוב (תוכן חדש בלבד)
- 2-4 כותרות משנה H2 בפורמט שאלה (כמו שמשתמשים מקלידים בגוגל), שמכסות זוויות ש**עוד לא** מכוסות בעמוד.
- תחת כל כותרת — פסקאות עם ערך פרקטי אמיתי, דוגמאות, פירוט.
- מקטע "שאלות נפוצות" בסוף (H2 "שאלות נפוצות", שאלות ב-H3).
- עברית בלבד (חוץ משמות מותג). טון מקצועי, ידידותי. פנייה בלשון רבים.
- כ-${targetWords} מילים של תוכן חדש.

## תפוקה
החזירו אך ורק HTML תקין של התוכן החדש (<p>, <h2>/<h3>, <ul>/<li>). בלי markdown, בלי \`\`\`, בלי טקסט הסבר לפני או אחרי.`
        : `אתם עורך תוכן SEO בכיר של ${businessName}. לפניכם עמוד קיים שצריך להעמיק ולהרחיב — לא לכתוב מחדש מאפס, אלא לשמר את כל המידע, הקישורים והעובדות הקיימים, ולהוסיף עומק.

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
    // 'append' is net-new content → just require a meaningful block. 'replace'
    // must actually exceed the prior length (else it shrank/no-op'd).
    const minWords = mode === 'elementor_append' ? Math.min(targetWords * 0.5, 300) : Math.max(t.words, THIN_WORD_THRESHOLD)
    if (wordCount(html) < minWords) return null
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

// Pull the FAQ Q&A pairs out of the generated body so we can emit FAQPage
// structured data for EXACTLY what we wrote (no re-read, works for Elementor too).
function extractFaqFromHtml(html: string): Array<{ question: string; answer: string }> {
    const out: Array<{ question: string; answer: string }> = []
    const idx = html.search(/<h2[^>]*>\s*שאלות נפוצות/i)
    const region = idx >= 0 ? html.slice(idx) : html
    const re = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|<h2|$)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(region)) !== null) {
        const q = stripHtml(m[1]).replace(/\s+/g, ' ').trim()
        const a = stripHtml(m[2]).replace(/\s+/g, ' ').trim()
        if (q.length >= 5 && a.length >= 10) out.push({ question: q, answer: a.slice(0, 600) })
        if (out.length >= 10) break
    }
    return out
}

function firstParagraphText(html: string): string {
    const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    return m ? stripHtml(m[1]).replace(/\s+/g, ' ').trim() : ''
}

/** One short LLM call → a real Hebrew meta description from the content we have. */
async function generateMetaDescription(apiKey: string, model: string, businessName: string, title: string, contentText: string): Promise<string | null> {
    const prompt = `כתבו meta description אחת ל-SEO (עד 155 תווים) לעמוד "${title}" של ${businessName}. עברית, משכנע, כולל את מילת המפתח המרכזית, פנייה בלשון רבים. החזירו אך ורק את הטקסט — בלי מירכאות, בלי הסבר.

תוכן העמוד: ${contentText.slice(0, 1500)}`
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
            signal: AbortSignal.timeout(60000),
        })
        if (!res.ok) return null
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const txt = (data.content?.find(c => c.type === 'text')?.text || '').trim().replace(/^["']|["']$/g, '')
        return txt ? txt.slice(0, 160) : null
    } catch { return null }
}

/** Brand social/entity URLs for Organization.sameAs (AEO entity linking). Best-effort. */
async function resolveSameAs(agentId?: string | null): Promise<string[] | undefined> {
    if (!agentId) return undefined
    try {
        const { db } = await import('@/db')
        const { matehAgents } = await import('@/db/schema')
        const { eq } = await import('drizzle-orm')
        const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))
        const rd: any = a?.researchData || {}
        const cand = [rd?.brandBook?.socialLinks, rd?.answers?.socialLinks, rd?.results?.brand?.sameAs, rd?.answers?.social]
            .flat().filter((u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u as string)) as string[]
        const uniq = Array.from(new Set(cand))
        return uniq.length ? uniq.slice(0, 10) : undefined
    } catch { return undefined }
}

async function writeMetaFields(cfg: WpCfg, type: WpType, id: number, meta: Record<string, string>): Promise<void> {
    const res = await fetch(`${norm(cfg.url)}/wp-json/wp/v2/${type}/${id}`, {
        method: 'POST',
        headers: { Authorization: auth(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta }),
        signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
}

/**
 * Apply the SEO/AEO technicals that belong WITH a content edit: FAQPage + page-type
 * schema (always, works classic + Elementor via the `_clawflow_schema_jsonld` meta
 * the companion renders), a generated meta description (Yoast + RankMath keys), and
 * internal links (classic posts only — the links service skips Elementor/pages).
 * When doWrite=false only the deterministic preview fields are computed (no writes,
 * no LLM) so the preview can say what WILL be added.
 */
async function applyEditTimeSeo(
    cfg: WpCfg,
    ctx: { instanceId: string; agentId?: string | null; businessName: string; apiKey?: string; model?: string; sameAs?: string[] },
    page: { type: WpType; id: number; title: string; link: string; builder?: string },
    html: string,
    doWrite: boolean,
): Promise<EditSeo> {
    const faq = extractFaqFromHtml(html)
    const primaryType = page.type === 'posts' ? 'Article' : 'WebPage'
    const out: EditSeo = { faqCount: faq.length, schemaTypes: ['Organization', 'WebSite', 'BreadcrumbList', primaryType, ...(faq.length ? ['FAQPage'] : [])] }
    if (!doWrite) return out

    const errors: string[] = []
    const firstPara = firstParagraphText(html)
    // 1) Structured data
    try {
        const primaryNode: Record<string, unknown> = { '@type': primaryType }
        primaryNode[primaryType === 'Article' ? 'headline' : 'name'] = page.title
        if (firstPara) primaryNode.description = firstPara.slice(0, 200)
        const jsonLd = assembleSchemaGraph(
            { name: ctx.businessName, siteUrl: cfg.url, sameAs: ctx.sameAs },
            { title: page.title, link: page.link, excerpt: firstPara },
            { primaryType, primaryNode, faq },
        )
        await writeMetaFields(cfg, page.type, page.id, { _clawflow_schema_jsonld: jsonLd })
        out.schemaWritten = true
    } catch (e) { errors.push('schema: ' + (e as Error).message) }
    // 2) Meta description
    if (ctx.apiKey && ctx.model) {
        try {
            const desc = await generateMetaDescription(ctx.apiKey, ctx.model, ctx.businessName, page.title, stripHtml(html))
            if (desc) { await writeMetaFields(cfg, page.type, page.id, { _yoast_wpseo_metadesc: desc, rank_math_description: desc }); out.metaDescription = desc }
        } catch (e) { errors.push('meta: ' + (e as Error).message) }
    }
    // 3) Internal links — classic posts only (service skips Elementor + pages)
    if (page.type === 'posts' && page.builder !== 'elementor') {
        try {
            const { runInternalLinks } = await import('@/services/seoInternalLinks')
            const r = await runInternalLinks(ctx.instanceId, { agentId: ctx.agentId, onlyIds: [page.id] }) as { updated?: unknown[] }
            out.internalLinks = Array.isArray(r?.updated) ? r.updated.length : 0
        } catch (e) { errors.push('links: ' + (e as Error).message) }
    }
    if (errors.length) out.errors = errors
    return out
}

export async function runPageRefresh(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; targetWords?: number; namedPages?: string[]; dryRun?: boolean; limit?: number } = {},
): Promise<PageRefreshResult> {
    const result: PageRefreshResult = { ok: false, integrationMissing: false, authError: false, scanned: 0, candidates: 0, targetWords: opts.targetWords || DEFAULT_TARGET_WORDS, updated: [], failures: [], skipped: [] }
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
            // Thin CONTENT only — exclude system/functional pages (cart, checkout,
            // account, thank-you, contact, accessibility, blog index, …) which must
            // never be expanded with SEO content.
            targets = all.filter(t => t.words < THIN_WORD_THRESHOLD && !isSystemPage(t)).sort((a, b) => a.words - b.words)
        }
    } catch (err) { result.error = (err as Error).message; return result }

    result.candidates = targets.length
    if (targets.length === 0) { result.ok = true; return result }   // idempotent no-op
    // Target N *successful* drafts (not N examined) — builder skips (homepage,
    // rich widget pages, unsupported builders) shouldn't starve the result.
    const wantDrafts = Math.min(opts.limit || MAX_REFRESH_PER_RUN, MAX_REFRESH_PER_RUN)
    const maxExamine = Math.min(targets.length, wantDrafts + 20)
    targets = targets.slice(0, maxExamine)

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key for instance'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || 'העסק'
    const sameAs = await resolveSameAs(opts.agentId)
    const targetWords = opts.targetWords || DEFAULT_TARGET_WORDS
    result.targetWords = targetWords

    const skip = (t: Target, reason: string) => result.skipped!.push({ type: t.type, id: t.id, title: t.title, reason })

    for (const t of targets) {
        if (result.updated.length >= wantDrafts) break
        try {
            // ── Builder-aware routing ──────────────────────────────────────────
            // Decide WHERE the content goes (post_content vs native Elementor
            // append) and re-judge thinness on the RENDERED content for builder
            // pages, so we never touch a homepage or a rich widget-built page.
            let writeMode: WriteMode = 'post_content'
            let baseContent = t.content
            let baseWords = t.words
            let builderLabel = 'classic'

            const bi = await companionBuilderInfo(cfg, t.id)
            if (bi) {
                builderLabel = bi.builder
                if (bi.isFrontPage) { skip(t, 'דף הבית — לא מרחיבים אותו במקום (תוכן ייעודי נפרד)'); continue }
                if (bi.isBuilder) {
                    // Real content lives in widgets — judge thinness on rendered text.
                    baseWords = bi.renderedWords || t.words
                    baseContent = bi.renderedExcerpt || t.content
                    if (baseWords >= THIN_WORD_THRESHOLD) { skip(t, `לא דק — ${baseWords} מילים בווידג'טים של ${bi.builder}`); continue }
                    if (bi.builder === 'elementor' && bi.canAppend) {
                        writeMode = 'elementor_append'
                    } else {
                        skip(t, `בנוי ב-${bi.builder} — הרחבה במקום עדיין לא נתמכת (מומלץ מאמר ייעודי)`); continue
                    }
                }
                // classic / gutenberg → post_content (default path)
            } else {
                // Companion absent — fall back to URL + content-signature heuristics.
                if (norm(t.link) === norm(cfg.url)) { skip(t, 'דף הבית — לא מרחיבים במקום'); continue }
                const heur = builderFromContent(t.content)
                if (heur !== 'classic' && heur !== 'gutenberg') {
                    builderLabel = heur
                    skip(t, `בנוי ב-${heur} — נדרש תוסף Flowmatic Companion כדי לערוך בבטחה`); continue
                }
            }

            const tForExpand: Target = { ...t, content: baseContent, words: baseWords }
            const html = await expandContent(apiKey, model, businessName, tForExpand, targetWords, writeMode)
            if (!html) { result.failures.push({ type: t.type, id: t.id, error: 'expansion did not produce enough content' }); continue }

            if (!opts.dryRun) {
                if (writeMode === 'elementor_append') {
                    const r = await elementorAppend(cfg, t.id, html)
                    if (!r.ok) throw new Error(`elementor-append: ${r.error || 'failed'}`)
                } else {
                    await writeContent(cfg, t, html)
                }
            }
            // Edit-time SEO/AEO: on a real write apply schema + meta + internal
            // links; on dryRun just compute what WILL be added (preview).
            const seo = await applyEditTimeSeo(
                cfg,
                { instanceId, agentId: opts.agentId, businessName, apiKey, model, sameAs },
                { type: t.type, id: t.id, title: t.title, link: t.link, builder: builderLabel },
                html, !opts.dryRun,
            )
            // Return the generated draft so it can be PREVIEWED before publishing
            // (publish-only-after-quality-check). writeMode tells the publish path
            // how to write it. For append mode afterWords = base + new block.
            const afterWords = writeMode === 'elementor_append' ? baseWords + wordCount(html) : wordCount(html)
            result.updated.push({ type: t.type, id: t.id, title: t.title, link: t.link, beforeWords: baseWords, afterWords, draftHtml: html, writeMode, builder: builderLabel, seo })
        } catch (err) {
            const msg = (err as Error).message
            if (/^(401|403)\b/.test(msg)) result.authError = true
            result.failures.push({ type: t.type, id: t.id, error: msg })
        }
    }
    result.ok = result.updated.length > 0 || result.failures.length === 0
    return result
}

/**
 * Publish-after-review: write the EXACT drafts the user reviewed (no
 * regeneration → what's published is what was approved). Used by the
 * preview-before-publish flow.
 */
export async function publishPageRefreshDraft(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string },
    drafts: Array<{ type: WpType; id: number; html: string; writeMode?: WriteMode; title?: string; link?: string; builder?: string }>,
): Promise<{ ok: boolean; integrationMissing?: boolean; published: Array<{ type: string; id: number; seo?: EditSeo }>; failures: Array<{ type: string; id: number; error: string }> }> {
    const out = { ok: false, published: [] as Array<{ type: string; id: number; seo?: EditSeo }>, failures: [] as Array<{ type: string; id: number; error: string }> }
    const cfg = await loadWpConfig(instanceId, opts.agentId) as WpCfg | null
    if (!cfg) return { ...out, integrationMissing: true }
    // Resolve the edit-time-SEO context once (same technicals applied on publish
    // as on a direct execute, so reviewed drafts get schema + meta + links too).
    const apiKey = await getApiKeyForInstance(instanceId).catch(() => null)
    const model = apiKey ? await resolveDirectModel(instanceId, 'yotzer').catch(() => '') : ''
    const businessName = opts.businessName || 'העסק'
    const sameAs = await resolveSameAs(opts.agentId)
    for (const d of drafts) {
        if (!d || !d.id || !d.html) { out.failures.push({ type: d?.type || '?', id: d?.id || 0, error: 'missing id/html' }); continue }
        try {
            if (d.writeMode === 'elementor_append') {
                const r = await elementorAppend(cfg, d.id, d.html)
                if (!r.ok) throw new Error(`elementor-append: ${r.error || 'failed'}`)
            } else {
                await writeContent(cfg, { type: d.type, id: d.id } as Target, d.html)
            }
            // Same holistic SEO/AEO pass as the execute path (schema + meta + links).
            let seo: EditSeo | undefined
            if (d.title && d.link) {
                seo = await applyEditTimeSeo(
                    cfg,
                    { instanceId, agentId: opts.agentId, businessName, apiKey: apiKey || undefined, model: model || undefined, sameAs },
                    { type: d.type, id: d.id, title: d.title, link: d.link, builder: d.builder },
                    d.html, true,
                )
            }
            out.published.push({ type: d.type, id: d.id, seo })
        } catch (err) { out.failures.push({ type: d.type, id: d.id, error: (err as Error).message }) }
    }
    out.ok = out.published.length > 0
    return out
}