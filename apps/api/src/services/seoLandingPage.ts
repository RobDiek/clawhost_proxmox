/**
 * Landing Page generator (WordPress + GitHub).
 *
 * Builds a conversion-focused landing page (hero → value props → social proof →
 * CTA → FAQ) in Hebrew from the approved task brief + business context, then:
 *   WP     → creates a PAGE as DRAFT (status='draft') so the user reviews +
 *            publishes in WP. Sets Yoast/Rank Math meta + ClawFlow schema.
 *   GitHub → commits a new MDX file in contentPath on a branch + PR.
 *
 * Draft-first by design: a new public page is high-stakes, so even post-approval
 * we stage it for a final human publish. Invoked by runLandingPageAdapter.
 */
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'
import { loadGithubConfig, type GithubCfg } from '@/services/seoGithubBatch'

export interface LandingPageResult {
    ok: boolean
    integrationMissing: boolean
    platform: 'wordpress' | 'github' | null
    title?: string
    editUrl?: string       // WP draft edit link / GitHub PR url
    error?: string
}

const TRANSIENT = new Set([429, 500, 502, 503, 504, 520, 521, 522, 524])
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
    let lastErr: Error | null = null
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, init)
            if (TRANSIENT.has(res.status) && i < tries - 1) { await new Promise(r => setTimeout(r, 1300 * (i + 1))); continue }
            return res
        } catch (err) { lastErr = err as Error; if (i < tries - 1) await new Promise(r => setTimeout(r, 1300 * (i + 1))) }
    }
    if (lastErr) throw lastErr
    throw new Error('fetchRetry exhausted')
}
function wpAuth(cfg: WpCfg): string { return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64') }
function norm(u: string): string { return u.replace(/\/+$/, '') }

interface LandingDraft {
    title: string; slug: string; metaDescription: string
    html: string; faq: Array<{ question: string; answer: string }>
}

async function generateLanding(apiKey: string, model: string, businessName: string, brief: string): Promise<LandingDraft | null> {
    const prompt = `אתם קופירייטר נחיתה בכיר של ${businessName}. בנו דף נחיתה ממיר בעברית לפי הבריף. מבנה: כותרת-על (hero) + תת-כותרת + 3-5 יתרונות/ערך + הוכחה חברתית (אם רלוונטי) + קריאה לפעולה ברורה + 3 שאלות נפוצות.

## בריף
${brief}

## חוקים
- 100% עברית, פנייה בגוף שני רבים (אתם/תוכלו), בלי אנגלית בגוף הטקסט (חוץ משמות מותג).
- HTML נקי: <h1> אחד, <h2>/<h3>, <p>, <ul><li>, <a> ל-CTA. בלי <html>/<body>/<style>/<script>.
- ממוקד המרה — כל מקטע מקדם לפעולה.

## תפוקה — JSON בלבד
{
  "title": "<כותרת הדף, 4-9 מילים, כולל מילת מפתח>",
  "slug": "<english-slug, lowercase, hyphens>",
  "metaDescription": "<140-160 תווים בעברית>",
  "html": "<גוף הדף ב-HTML נקי לפי המבנה למעלה>",
  "faq": [ { "question": "<שאלה>", "answer": "<תשובה 40-70 מילים>" } ]
}`
    const res = await fetchRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 5000, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(180000),
    })
    if (!res.ok) return null
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
    let text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
    const fi = text.indexOf('{'), li = text.lastIndexOf('}')
    if (fi < 0 || li < 0) return null
    text = text.substring(fi, li + 1)
    text = Array.from(text).map(ch => { const c = ch.charCodeAt(0); return (c < 32 && ch !== '\n' && ch !== '\t' && ch !== '\r') ? '' : ch }).join('')
    try {
        const p = JSON.parse(text) as Partial<LandingDraft>
        if (!p.title || !p.html) return null
        const slug = (p.slug || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'landing'
        return {
            title: String(p.title), slug,
            metaDescription: String(p.metaDescription || '').slice(0, 170),
            html: String(p.html),
            faq: Array.isArray(p.faq) ? p.faq.filter(q => q && typeof q.question === 'string' && typeof q.answer === 'string').slice(0, 6) : [],
        }
    } catch { return null }
}

function faqSchema(draft: LandingDraft): string {
    if (!draft.faq.length) return ''
    return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: draft.faq.map(q => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })) })
}

export async function runLandingPage(
    instanceId: string,
    brief: string,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean } = {},
): Promise<LandingPageResult> {
    const result: LandingPageResult = { ok: false, integrationMissing: false, platform: null }
    const wp = await loadWpConfig(instanceId, opts.agentId)
    const ghc = wp ? null : await loadGithubConfig(instanceId, opts.agentId)
    if (!wp && !ghc) { result.integrationMissing = true; return result }
    result.platform = wp ? 'wordpress' : 'github'

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const draft = await generateLanding(apiKey, model, opts.businessName || 'העסק', brief)
    if (!draft) { result.error = 'generation failed'; return result }
    result.title = draft.title

    // Append FAQ block + schema to the body
    let html = draft.html
    if (draft.faq.length) {
        html += '<h2>שאלות נפוצות</h2>' + draft.faq.map(q => `<h3>${q.question}</h3><p>${q.answer}</p>`).join('')
        const fs = faqSchema(draft)
        if (fs) html += `<script type="application/ld+json">${fs}</script>`
    }

    if (opts.dryRun) { result.ok = true; result.editUrl = wp ? '(dry-run WP draft)' : '(dry-run GitHub PR)'; result.title = draft.title; return result }

    try {
        if (wp) {
            const base = norm(wp.url)
            const res = await fetchRetry(`${base}/wp-json/wp/v2/pages`, {
                method: 'POST', headers: { Authorization: wpAuth(wp), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: draft.title, content: html, status: 'draft', slug: draft.slug,
                    excerpt: draft.metaDescription,
                    meta: { _yoast_wpseo_metadesc: draft.metaDescription, rank_math_description: draft.metaDescription },
                }),
                signal: AbortSignal.timeout(45000),
            })
            if (!res.ok) throw new Error(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
            const j = await res.json() as { id?: number }
            result.editUrl = `${base}/wp-admin/post.php?post=${j.id}&action=edit`
        } else {
            const cfg = ghc!
            const h = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ClawFlow-SEO', 'Content-Type': 'application/json' }
            const refRes = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, { headers: h })
            const baseSha = ((await refRes.json()) as { object?: { sha?: string } }).object?.sha
            if (!baseSha) throw new Error('no base sha')
            const newBranch = `clawflow/landing-${draft.slug}-${baseSha.slice(0, 6)}`
            const cr = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/git/refs`, { method: 'POST', headers: h, body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) })
            if (!cr.ok && cr.status !== 422) throw new Error(`create branch ${cr.status}`)
            const fm = ['---', `title: '${draft.title.replace(/'/g, "''")}'`, `description: '${draft.metaDescription.replace(/'/g, "''")}'`, `slug: '${draft.slug}'`, 'draft: true', '---', ''].join('\n')
            const path = `${cfg.contentPath}/${draft.slug}.md`
            const put = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
                method: 'PUT', headers: h,
                body: JSON.stringify({ message: `Landing page: ${draft.title}`, content: Buffer.from(fm + html, 'utf-8').toString('base64'), branch: newBranch }),
            })
            if (!put.ok) throw new Error(`put ${put.status}`)
            const pr = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/pulls`, { method: 'POST', headers: h, body: JSON.stringify({ title: `ClawFlow landing: ${draft.title}`, head: newBranch, base: cfg.branch, body: 'Draft landing page by ClawFlow — review and merge.' }) })
            result.editUrl = pr.ok ? (((await pr.json()) as { html_url?: string }).html_url || `branch:${newBranch}`) : `branch:${newBranch}`
        }
        result.ok = true
    } catch (err) { result.error = (err as Error).message }
    return result
}