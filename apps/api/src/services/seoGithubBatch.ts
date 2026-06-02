/**
 * SEO retrofit for GitHub-hosted static sites (Hugo/Astro/Jekyll/Next-MDX).
 *
 * GitHub parity for the WordPress SEO suite. For tenants whose site is a repo
 * (not WordPress), the same four operations apply to the markdown/MDX files:
 *
 *   - 'meta'   : add a `description:` frontmatter key where missing
 *   - 'schema' : add a `schema:` frontmatter key (full JSON-LD @graph) where missing
 *   - 'slug'   : PROPOSE clean Latin slugs for Hebrew/encoded filenames (no write)
 *   - 'links'  : insert contextual internal markdown links into the body
 *
 * Write operations land on a NEW branch + Pull Request (never a direct push to
 * the default branch) — matching the GitHub safety rules Flowmatic writes into
 * SOUL.md. Frontmatter edits are append-only (we never rewrite existing YAML).
 *
 * Invoked by monthlyTaskExecutor's SEO adapters when the tenant is GitHub-
 * connected (and WordPress is not), AFTER user task-approval.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, matehAgents } from '@/db/schema'
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'

const MAX_FILES_PER_RUN = 15
const LINKS_PER_FILE = 3
const MIN_ANCHOR_LEN = 12

export interface GithubCfg { token: string; repo: string; branch: string; contentPath: string }

export type GithubSeoOp = 'meta' | 'schema' | 'links' | 'slug'

export interface GithubSeoResult {
    ok: boolean
    integrationMissing: boolean
    op: GithubSeoOp
    scanned: number
    candidates: number
    changed: Array<{ path: string; detail: string }>
    proposals: Array<{ path: string; suggestedSlug: string }>   // slug op only
    prUrl?: string
    failures: Array<{ path: string; error: string }>
    error?: string
}

interface MdFile { path: string; name: string; sha: string; text: string; title: string }

const TRANSIENT = new Set([429, 500, 502, 503, 504])
async function gh(cfg: GithubCfg, path: string, init: RequestInit = {}, tries = 3): Promise<Response> {
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`
    let lastErr: Error | null = null
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, {
                ...init,
                headers: {
                    Authorization: `Bearer ${cfg.token}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'Flowmatic-SEO',
                    ...(init.headers || {}),
                },
                signal: AbortSignal.timeout(30000),
            })
            if (TRANSIENT.has(res.status) && i < tries - 1) { await new Promise(r => setTimeout(r, 1200 * (i + 1))); continue }
            return res
        } catch (err) { lastErr = err as Error; if (i < tries - 1) await new Promise(r => setTimeout(r, 1200 * (i + 1))) }
    }
    if (lastErr) throw lastErr
    throw new Error('gh fetch exhausted')
}

export async function loadGithubConfig(instanceId: string, agentId?: string | null): Promise<GithubCfg | null> {
    let cfg: any = null
    if (agentId) {
        const [a] = await db.select({ gh: matehAgents.githubConfig }).from(matehAgents)
            .where(and(eq(matehAgents.id, agentId), eq(matehAgents.vpsInstanceId, instanceId)))
        cfg = a?.gh || null
    }
    if (!cfg) {
        const [a] = await db.select({ gh: matehAgents.githubConfig }).from(matehAgents).where(eq(matehAgents.vpsInstanceId, instanceId))
        cfg = a?.gh || null
    }
    if (!cfg) {
        const [i] = await db.select({ gh: instances.githubConfig }).from(instances).where(eq(instances.id, instanceId))
        cfg = i?.gh || null
    }
    if (!cfg?.token || !cfg?.repo) return null
    return { token: cfg.token, repo: cfg.repo, branch: cfg.branch || 'main', contentPath: (cfg.contentPath || 'content').replace(/^\/+|\/+$/g, '') }
}

// ─── frontmatter (append-only; never rewrite existing YAML) ──────────────────
function splitFrontmatter(text: string): { fm: string; body: string; hasFm: boolean } {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!m) return { fm: '', body: text, hasFm: false }
    return { fm: m[1], body: m[2], hasFm: true }
}
function fmHasKey(fm: string, key: string): boolean { return new RegExp(`^${key}\\s*:`, 'm').test(fm) }
function fmGet(fm: string, key: string): string | null {
    const m = fm.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'))
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null
}
function yamlSingle(v: string): string { return `'${v.replace(/'/g, "''")}'` }
function rebuild(fm: string, body: string): string { return `---\n${fm}\n---\n${body}` }

function deriveTitle(file: { name: string; fm: string }): string {
    const t = fmGet(file.fm, 'title')
    if (t) return t
    return file.name.replace(/\.(md|mdx)$/i, '').replace(/[-_]/g, ' ')
}

async function listMarkdown(cfg: GithubCfg): Promise<MdFile[]> {
    const res = await gh(cfg, `/repos/${cfg.repo}/contents/${cfg.contentPath}?ref=${encodeURIComponent(cfg.branch)}`)
    if (!res.ok) throw new Error(`list contents ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
    const entries = await res.json() as Array<{ type?: string; name?: string; path?: string }>
    const files: MdFile[] = []
    for (const e of entries) {
        if (e.type !== 'file' || !e.name || !e.path) continue
        if (!/\.(md|mdx)$/i.test(e.name)) continue
        const f = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURIComponent(e.path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(cfg.branch)}`)
        if (!f.ok) continue
        const j = await f.json() as { sha?: string; content?: string; encoding?: string }
        const text = j.content && j.encoding === 'base64' ? Buffer.from(j.content, 'base64').toString('utf-8') : ''
        const { fm } = splitFrontmatter(text)
        files.push({ path: e.path, name: e.name, sha: j.sha || '', text, title: deriveTitle({ name: e.name, fm }) })
    }
    return files
}

// ─── LLM generation (reuse tenant key/model) ─────────────────────────────────
async function callAnthropic(apiKey: string, model: string, prompt: string, maxTokens: number): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) return ''
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
    return (data.content?.find(c => c.type === 'text')?.text || '').trim()
}
function extractJson(text: string): any | null {
    const f = text.indexOf('{'), l = text.lastIndexOf('}')
    if (f < 0 || l < 0) return null
    try { return JSON.parse(text.substring(f, l + 1)) } catch { return null }
}

// ─── commit changed files on a new branch + open a PR ────────────────────────
async function commitViaPR(cfg: GithubCfg, opLabel: string, changes: Array<{ path: string; sha: string; content: string }>): Promise<string> {
    // base branch head sha
    const refRes = await gh(cfg, `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`)
    if (!refRes.ok) throw new Error(`get ref ${refRes.status}`)
    const baseSha = ((await refRes.json()) as { object?: { sha?: string } }).object?.sha
    if (!baseSha) throw new Error('no base sha')
    const newBranch = `clawflow/seo-${opLabel}-${baseSha.slice(0, 7)}`
    // create branch (ignore 422 = already exists)
    const cr = await gh(cfg, `/repos/${cfg.repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) })
    if (!cr.ok && cr.status !== 422) throw new Error(`create branch ${cr.status}: ${(await cr.text().catch(() => '')).slice(0, 160)}`)
    // PUT each file onto the new branch
    for (const ch of changes) {
        const put = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURIComponent(ch.path).replace(/%2F/g, '/')}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: `SEO ${opLabel}: ${ch.path.split('/').pop()}`,
                content: Buffer.from(ch.content, 'utf-8').toString('base64'),
                sha: ch.sha, branch: newBranch,
            }),
        })
        if (!put.ok) throw new Error(`put ${ch.path} ${put.status}: ${(await put.text().catch(() => '')).slice(0, 160)}`)
    }
    // open PR
    const pr = await gh(cfg, `/repos/${cfg.repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title: `Flowmatic SEO: ${opLabel} (${changes.length} files)`, head: newBranch, base: cfg.branch, body: `Automated SEO ${opLabel} retrofit by Flowmatic. Review and merge.` }),
    })
    if (!pr.ok) {
        if (pr.status === 422) return `branch:${newBranch}`   // PR may already exist
        throw new Error(`open PR ${pr.status}: ${(await pr.text().catch(() => '')).slice(0, 160)}`)
    }
    return ((await pr.json()) as { html_url?: string }).html_url || `branch:${newBranch}`
}

export async function runSeoGithubBatch(
    instanceId: string,
    op: GithubSeoOp,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean } = {},
): Promise<GithubSeoResult> {
    const result: GithubSeoResult = { ok: false, integrationMissing: false, op, scanned: 0, candidates: 0, changed: [], proposals: [], failures: [] }
    const cfg = await loadGithubConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }

    let files: MdFile[]
    try { files = await listMarkdown(cfg) } catch (err) { result.error = (err as Error).message; return result }
    result.scanned = files.length
    if (files.length === 0) { result.ok = true; return result }

    const apiKey = await getApiKeyForInstance(instanceId)
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const businessName = opts.businessName || 'העסק'
    const base = `https://github.com/${cfg.repo}`

    // ── slug: propose-only ──
    if (op === 'slug') {
        const cands = files.filter(f => /%[0-9a-f]{2}/i.test(f.name) || /[^ -~]/.test(f.name))
        result.candidates = cands.length
        for (const f of cands.slice(0, MAX_FILES_PER_RUN)) {
            const out = apiKey ? await callAnthropic(apiKey, model, `Translate this Hebrew page title to a short clean English URL slug (2-5 words, lowercase, hyphens, a-z0-9 only). Return JSON: {"slug":"..."}\n\nTitle: ${f.title}`, 200) : ''
            const slug = (extractJson(out)?.slug || '').toString().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
            if (slug.length >= 3) result.proposals.push({ path: f.path, suggestedSlug: slug })
        }
        result.ok = true
        return result
    }

    // ── meta / schema: per-file frontmatter add ──
    if (op === 'meta' || op === 'schema') {
        const key = op === 'meta' ? 'description' : 'schema'
        const cands = files.filter(f => { const { fm } = splitFrontmatter(f.text); return !fmHasKey(fm, key) })
        result.candidates = cands.length
        const changes: Array<{ path: string; sha: string; content: string }> = []
        for (const f of cands.slice(0, MAX_FILES_PER_RUN)) {
            const { fm, body, hasFm } = splitFrontmatter(f.text)
            if (!hasFm) { result.failures.push({ path: f.path, error: 'no frontmatter block' }); continue }
            const bodySnippet = body.replace(/[#*_>`[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500)
            let line = ''
            let detail = ''
            if (op === 'meta') {
                if (!apiKey) { result.failures.push({ path: f.path, error: 'no API key' }); continue }
                const out = await callAnthropic(apiKey, model, `כתבו תיאור מטא בעברית (140-160 תווים, מפתה לקליק, מילת מפתח טבעית) לעמוד הבא. JSON בלבד: {"description":"..."}\n\nכותרת: ${f.title}\nתוכן: ${bodySnippet}`, 400)
                const desc = (extractJson(out)?.description || '').toString().trim().slice(0, 170)
                if (desc.length < 80) { result.failures.push({ path: f.path, error: 'no description generated' }); continue }
                line = `description: ${yamlSingle(desc)}`
                detail = desc
            } else {
                const graph = buildSchemaGraph(businessName, base, f, body)
                line = `schema: ${yamlSingle(JSON.stringify(graph))}`
                detail = (graph['@graph'] as any[]).map(n => n['@type']).join(', ')
            }
            const newText = rebuild(fm + '\n' + line, body)
            if (opts.dryRun) { result.changed.push({ path: f.path, detail }); continue }
            changes.push({ path: f.path, sha: f.sha, content: newText })
            result.changed.push({ path: f.path, detail })
        }
        if (!opts.dryRun && changes.length) {
            try { result.prUrl = await commitViaPR(cfg, op, changes) } catch (err) { result.error = (err as Error).message; result.changed = []; result.failures.push({ path: '(commit)', error: (err as Error).message }) }
        }
        result.ok = result.changed.length > 0 || result.failures.length === 0
        return result
    }

    // ── links: insert contextual markdown links into the body ──
    if (op === 'links') {
        // corpus = title → site path (use repo-relative content path as link target;
        // real URL mapping is theme-specific, so link to the source file path which
        // the user/theme resolves — conservative + reviewable in the PR).
        const corpus = files.map(f => ({ path: f.path, anchor: f.title.split(/[:–—|?!]/)[0].trim(), url: `/${f.name.replace(/\.(md|mdx)$/i, '')}/` }))
            .filter(c => c.anchor.length >= MIN_ANCHOR_LEN)
        result.candidates = files.length
        const changes: Array<{ path: string; sha: string; content: string }> = []
        for (const f of files.slice(0, MAX_FILES_PER_RUN)) {
            const { fm, body, hasFm } = splitFrontmatter(f.text)
            if (!hasFm) continue
            let newBody = body
            const inserted: string[] = []
            const seen = new Set<string>()
            for (const t of corpus.filter(c => c.path !== f.path).sort((a, b) => b.anchor.length - a.anchor.length)) {
                if (inserted.length >= LINKS_PER_FILE) break
                if (seen.has(t.url) || newBody.includes(`](${t.url})`)) continue
                // Only link first occurrence in plain text (not in existing []() links or headings).
                const re = new RegExp(`(^|[^\\[\\]\\(\\)#])(${t.anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[\\s.,;:)]|$)`, 'm')
                const mm = re.exec(newBody)
                if (!mm) continue
                newBody = newBody.slice(0, mm.index) + mm[1] + `[${mm[2]}](${t.url})` + newBody.slice(mm.index + mm[0].length)
                inserted.push(`"${mm[2]}" → ${t.url}`)
                seen.add(t.url)
            }
            if (inserted.length === 0) continue
            const newText = rebuild(fm, newBody)
            if (opts.dryRun) { result.changed.push({ path: f.path, detail: inserted.join(' · ') }); continue }
            changes.push({ path: f.path, sha: f.sha, content: newText })
            result.changed.push({ path: f.path, detail: inserted.join(' · ') })
        }
        if (!opts.dryRun && changes.length) {
            try { result.prUrl = await commitViaPR(cfg, 'links', changes) } catch (err) { result.error = (err as Error).message; result.changed = []; result.failures.push({ path: '(commit)', error: (err as Error).message }) }
        }
        result.ok = result.changed.length > 0 || result.failures.length === 0
        return result
    }

    result.error = `unknown op ${op}`
    return result
}

function buildSchemaGraph(businessName: string, repoBase: string, f: MdFile, body: string): Record<string, unknown> {
    const { fm } = splitFrontmatter(f.text)
    const url = `${repoBase}/${f.name}`
    const org = { '@type': 'Organization', '@id': repoBase + '#organization', name: businessName }
    const website = { '@type': 'WebSite', '@id': repoBase + '#website', name: businessName, publisher: { '@id': repoBase + '#organization' }, inLanguage: 'he-IL' }
    const article: Record<string, unknown> = {
        '@type': 'Article', headline: f.title, inLanguage: 'he-IL', url,
        isPartOf: { '@id': repoBase + '#website' }, publisher: { '@id': repoBase + '#organization' },
    }
    const date = fmGet(fm, 'date')
    if (date) article.datePublished = date
    const desc = fmGet(fm, 'description')
    if (desc) article.description = desc
    const graph: Record<string, unknown>[] = [org, website, article]
    // FAQPage if the body has a Q&A section.
    const faqMatch = body.match(/##\s*שאלות[\s\S]*/)
    if (faqMatch) {
        const qa = Array.from(faqMatch[0].matchAll(/(?:^|\n)([^?\n]{8,}\?)\s*\n?\s*([^\n]{10,})/g)).slice(0, 5)
        if (qa.length) graph.push({ '@type': 'FAQPage', mainEntity: qa.map(m => ({ '@type': 'Question', name: m[1].trim(), acceptedAnswer: { '@type': 'Answer', text: m[2].trim() } })) })
    }
    return { '@context': 'https://schema.org', '@graph': graph }
}