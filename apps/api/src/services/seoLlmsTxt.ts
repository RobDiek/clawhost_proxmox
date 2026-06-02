/**
 * llms.txt generator — AEO / LLM-promotion (WordPress + GitHub).
 *
 * Builds an llms.txt (the emerging standard that helps AI crawlers — ChatGPT,
 * Perplexity, Gemini, Claude — understand and cite a site): a business summary
 * + a curated list of the key pages with one-line descriptions.
 *
 *   WP     → POST to companion plugin (v1.10.0+) /clawflow/v1/llms-txt; the
 *            plugin serves it at /llms.txt as text/plain.
 *   GitHub → commit llms.txt at the repo root on a branch + PR.
 *
 * Invoked by monthlyTaskExecutor's runLlmsTxtAdapter AFTER user task-approval.
 */
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'
import { loadWpConfig, type WpCfg } from '@/services/seoMetaBatch'
import { loadGithubConfig, type GithubCfg } from '@/services/seoGithubBatch'

const MAX_PAGES_IN_INDEX = 60
const MAX_SCAN_PAGES = 5

interface PageEntry { title: string; url: string; desc: string }

export interface LlmsTxtResult {
    ok: boolean
    integrationMissing: boolean
    platform: 'wordpress' | 'github' | null
    pages: number
    bytes: number
    servedAt?: string      // WP: /llms.txt URL ; GitHub: PR url
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
function strip(s: string): string { return String(s || '').replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim() }

async function wpCorpus(cfg: WpCfg): Promise<PageEntry[]> {
    const base = norm(cfg.url)
    const out: PageEntry[] = []
    for (const type of ['pages', 'posts'] as const) {
        for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
            const url = `${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=title,link,excerpt,yoast_head_json`
            const res = await fetchRetry(url, { headers: { Authorization: wpAuth(cfg) }, signal: AbortSignal.timeout(30000) })
            if (res.status === 400 || !res.ok) break
            const rows = await res.json().catch(() => []) as Array<{ title?: { rendered?: string }; link?: string; excerpt?: { rendered?: string }; yoast_head_json?: { description?: string } }>
            if (!Array.isArray(rows) || rows.length === 0) break
            for (const r of rows) {
                if (!r.link) continue
                out.push({ title: strip(r.title?.rendered || ''), url: r.link, desc: strip(r.yoast_head_json?.description || r.excerpt?.rendered || '').slice(0, 160) })
            }
            if (rows.length < 100) break
        }
    }
    return out
}

async function ghCorpus(cfg: GithubCfg): Promise<PageEntry[]> {
    const out: PageEntry[] = []
    const res = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/contents/${cfg.contentPath}?ref=${encodeURIComponent(cfg.branch)}`, {
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ClawFlow-SEO' }, signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return out
    const entries = await res.json() as Array<{ type?: string; name?: string; path?: string }>
    for (const e of entries) {
        if (e.type !== 'file' || !e.name || !/\.(md|mdx)$/i.test(e.name)) continue
        const slug = e.name.replace(/\.(md|mdx)$/i, '')
        const title = slug.replace(/[-_]/g, ' ')
        out.push({ title, url: `/${slug}/`, desc: '' })
    }
    return out
}

async function generateLlmsTxt(apiKey: string, model: string, businessName: string, siteUrl: string, pages: PageEntry[]): Promise<string> {
    const list = pages.slice(0, MAX_PAGES_IN_INDEX).map(p => ({ title: p.title, url: p.url, desc: p.desc }))
    const prompt = `צרו קובץ llms.txt עבור "${businessName}" (${siteUrl}) — קובץ סטנדרטי שעוזר למנועי AI (ChatGPT, Perplexity, Gemini, Claude) להבין ולצטט את האתר.

פורמט (Markdown, עברית):
# ${businessName}

> משפט אחד שמתאר מה העסק עושה ולמי.

## עמודים מרכזיים
- [כותרת](url): תיאור קצר (עד 15 מילים)

דפים זמינים:
${JSON.stringify(list, null, 2)}

חוקים: בחרו את העמודים המועילים ביותר ל-AI (מדריכים, מוצרים, שירות, אודות, צור קשר). השמיטו עמודים טכניים (תודה, נגישות, תקנון). כתבו תיאורים ענייניים בעברית. החזירו את תוכן ה-llms.txt בלבד, בלי הסברים, בלי גושי קוד.`
    const res = await fetchRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) return ''
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
    let text = (data.content?.find(c => c.type === 'text')?.text || '').trim()
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()   // strip any stray fences
    return text
}

async function ghCommitRootFile(cfg: GithubCfg, filename: string, content: string): Promise<string> {
    const h = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'ClawFlow-SEO', 'Content-Type': 'application/json' }
    const refRes = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, { headers: h })
    const baseSha = ((await refRes.json()) as { object?: { sha?: string } }).object?.sha
    if (!baseSha) throw new Error('no base sha')
    const newBranch = `clawflow/seo-llms-${baseSha.slice(0, 7)}`
    const cr = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/git/refs`, { method: 'POST', headers: h, body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) })
    if (!cr.ok && cr.status !== 422) throw new Error(`create branch ${cr.status}`)
    // existing sha (file may already exist)
    let sha: string | undefined
    const ex = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/contents/${filename}?ref=${newBranch}`, { headers: h })
    if (ex.ok) sha = ((await ex.json()) as { sha?: string }).sha
    const put = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/contents/${filename}`, {
        method: 'PUT', headers: h,
        body: JSON.stringify({ message: `SEO: add ${filename} for AI crawlers`, content: Buffer.from(content, 'utf-8').toString('base64'), branch: newBranch, sha }),
    })
    if (!put.ok) throw new Error(`put ${filename} ${put.status}`)
    const pr = await fetchRetry(`https://api.github.com/repos/${cfg.repo}/pulls`, { method: 'POST', headers: h, body: JSON.stringify({ title: `ClawFlow SEO: ${filename}`, head: newBranch, base: cfg.branch, body: 'Automated llms.txt for AI crawlers by ClawFlow.' }) })
    if (pr.ok) return ((await pr.json()) as { html_url?: string }).html_url || `branch:${newBranch}`
    if (pr.status === 422) return `branch:${newBranch}`
    throw new Error(`open PR ${pr.status}`)
}

export async function runLlmsTxt(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean; platform?: 'wordpress' | 'github' } = {},
): Promise<LlmsTxtResult> {
    const result: LlmsTxtResult = { ok: false, integrationMissing: false, platform: null, pages: 0, bytes: 0 }

    const wp = opts.platform === 'github' ? null : await loadWpConfig(instanceId, opts.agentId)
    const ghc = wp ? null : await loadGithubConfig(instanceId, opts.agentId)
    if (!wp && !ghc) { result.integrationMissing = true; return result }
    result.platform = wp ? 'wordpress' : 'github'

    let pages: PageEntry[]
    try { pages = wp ? await wpCorpus(wp) : await ghCorpus(ghc!) }
    catch (err) { result.error = (err as Error).message; return result }
    result.pages = pages.length
    if (pages.length === 0) { result.error = 'no pages found'; return result }

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { result.error = 'no API key'; return result }
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const siteUrl = wp ? norm(wp.url) : `https://github.com/${ghc!.repo}`
    const content = await generateLlmsTxt(apiKey, model, opts.businessName || 'העסק', siteUrl, pages)
    if (!content || content.length < 40) { result.error = 'generation failed'; return result }
    result.bytes = Buffer.byteLength(content, 'utf-8')

    if (opts.dryRun) { result.ok = true; result.servedAt = wp ? `${siteUrl}/llms.txt (dry-run)` : '(dry-run PR)'; return result }

    try {
        if (wp) {
            const res = await fetchRetry(`${norm(wp.url)}/wp-json/clawflow/v1/llms-txt`, {
                method: 'POST', headers: { Authorization: wpAuth(wp), 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }), signal: AbortSignal.timeout(30000),
            })
            if (!res.ok) {
                const txt = await res.text().catch(() => '')
                if (res.status === 404) throw new Error('llms_route_missing: companion plugin v1.10.0+ required')
                throw new Error(`${res.status}: ${txt.slice(0, 160)}`)
            }
            result.servedAt = `${norm(wp.url)}/llms.txt`
        } else {
            result.servedAt = await ghCommitRootFile(ghc!, 'llms.txt', content)
        }
        result.ok = true
    } catch (err) { result.error = (err as Error).message }
    return result
}