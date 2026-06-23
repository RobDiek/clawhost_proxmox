/**
 * SEO retrofit for GitHub-hosted static sites (Hugo/Astro/Jekyll/Next-MDX).
 *
 * GitHub parity for the WordPress SEO suite. For tenants whose site is a repo
 * (not WordPress), the same four operations apply to the markdown/MDX files:
 *
 *   - 'meta'        : add a `description:` frontmatter key where missing
 *   - 'schema'      : add a `schema:` frontmatter key (full JSON-LD @graph) where missing
 *   - 'slug'        : PROPOSE clean Latin slugs for Hebrew/encoded filenames (no write)
 *   - 'links'       : insert contextual internal markdown links into the body
 *   - 'body_expand' : deepen/expand thin page bodies (page-refresh parity)
 *   - 'image_alt'   : fill missing alt text on inline markdown / <img> images
 *   - 'answer_first': prepend a concise answer paragraph (AEO/featured snippet)
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

export type GithubSeoOp = 'meta' | 'schema' | 'links' | 'slug' | 'body_expand' | 'image_alt' | 'answer_first'

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

// True if the repo is a Next.js App Router site (has app/**/page.tsx). The
// markdown-only SEO ops can't see these pages, so a "0 candidates" there is "not
// covered", NOT "already optimal" — callers use this for an honest verdict.
export async function hasAppRouterPages(instanceId: string, agentId?: string | null): Promise<boolean> {
    const cfg = await loadGithubConfig(instanceId, agentId)
    if (!cfg) return false
    try {
        const tree = await gh(cfg, `/repos/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`)
        if (!tree.ok) return false
        const items = ((await tree.json()) as { tree?: Array<{ path?: string }> }).tree || []
        return items.some(t => !!t.path && /^app\/.*page\.(tsx|jsx|ts|js)$/.test(t.path))
    } catch { return false }
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

// Plain-text word count (strip markdown punctuation first).
function countWords(s: string): number { return ((s || '').replace(/[#*_>`[\]()]/g, ' ').match(/\S+/g) || []).length }
// Strip an LLM-returned ```code fence``` wrapper if present.
function stripFences(s: string): string { return (s || '').replace(/^```[a-z]*\r?\n?/i, '').replace(/```\s*$/i, '').trim() }
// Nearest preceding markdown heading text before a body offset (for image-alt context).
function headingBefore(body: string, idx: number): string {
    const before = body.slice(0, idx)
    const matches = Array.from(before.matchAll(/^#{1,4}\s+(.+)$/gm))
    return matches.length ? matches[matches.length - 1][1].trim() : ''
}

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

// ─── Next.js App Router metadata (title/description) DEDUP ───────────────────
// Next.js App Router sites (flowmatic.co.il etc.) keep per-page SEO in
// `export const metadata` inside app/**/page.tsx — NOT markdown frontmatter. A
// page WITHOUT its own metadata inherits the root layout default → multiple
// pages share the SAME title/description = cannibalization. The markdown 'meta'
// op above is blind to this. This scans the app/ tree, finds pages that collide
// (or inherit the default), generates UNIQUE metadata, and opens a PR.
interface AppPage { path: string; sha: string; text: string; routePath: string; title: string | null; description: string | null; hasExport: boolean }

function routeFromPath(p: string): string {
    const seg = p.replace(/^app\//, '').replace(/\/?page\.(tsx|jsx|ts|js)$/, '')   // root: "page.tsx" → ""
    const clean = seg.split('/').filter(s => s && !/^\(.*\)$/.test(s)).join('/')   // drop route groups (x)
    return '/' + clean
}
function jsString(s: string): string { return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` }
// Best-effort brace match for `export const metadata = {…}`.
function metadataObjectBody(text: string): string | null {
    const i = text.search(/export\s+const\s+metadata\b[^=]*=\s*\{/)
    if (i < 0) return null
    const open = text.indexOf('{', i)
    let depth = 0
    for (let j = open; j < text.length; j++) {
        const c = text[j]
        if (c === '{') depth++
        else if (c === '}') { depth--; if (depth === 0) return text.slice(open, j + 1) }
    }
    return null
}
function tsStringField(src: string, key: string): string | null {
    const m = src.match(new RegExp(`\\b${key}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`))
    return m ? m[2].trim() : null
}
function parseAppMetadata(text: string): { hasExport: boolean; title: string | null; description: string | null; titleIsObject: boolean } {
    const body = metadataObjectBody(text)
    if (!body) return { hasExport: false, title: null, description: null, titleIsObject: false }
    let title = tsStringField(body, 'title')
    const titleIsObject = !title && /\btitle\s*:\s*\{/.test(body)
    if (titleIsObject) title = tsStringField(body, 'default') || tsStringField(body, 'absolute')
    return { hasExport: true, title, description: tsStringField(body, 'description'), titleIsObject }
}
function ensureMetadataImport(text: string): string {
    if (/\bMetadata\b[^=]*from\s*['"]next['"]/.test(text)) return text
    return `import type { Metadata } from 'next'\n` + text
}
// Insert (no existing export) or update title/description in-place. Returns null
// if the shape is too complex to edit safely (caller records a failure).
function upsertAppMetadata(text: string, title: string, description: string, hadExport: boolean, titleIsObject: boolean, canonicalPath?: string): string | null {
    if (!hadExport) {
        const out = ensureMetadataImport(text)
        // Self-canonical too (the dedup task explicitly asks for it; fixes the
        // audit's "non-self canonical" finding). Only on the safe insert path.
        const canon = canonicalPath ? `\n  alternates: { canonical: ${jsString(canonicalPath)} },` : ''
        const block = `export const metadata: Metadata = {\n  title: ${jsString(title)},\n  description: ${jsString(description)},${canon}\n}`
        const lines = out.split('\n')
        let lastImport = -1
        for (let i = 0; i < lines.length; i++) if (/^\s*import\b/.test(lines[i])) lastImport = i
        lines.splice(lastImport >= 0 ? lastImport + 1 : 0, 0, '', block)
        return lines.join('\n')
    }
    if (titleIsObject) return null   // object title (template/default) — don't risk an in-place rewrite
    const body = metadataObjectBody(text)
    if (!body) return null
    let nb = body
    const setField = (k: string, v: string) => {
        const re = new RegExp(`(\\b${k}\\s*:\\s*)(['"\`])[\\s\\S]*?\\2`)
        nb = re.test(nb) ? nb.replace(re, `$1${jsString(v)}`) : nb.replace(/\{/, `{\n  ${k}: ${jsString(v)},`)
    }
    setField('title', title)
    setField('description', description)
    return text.replace(body, nb)
}
async function listAppPages(cfg: GithubCfg): Promise<{ pages: AppPage[]; layout: { title: string | null; description: string | null; template: string | null } | null }> {
    const tree = await gh(cfg, `/repos/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`)
    if (!tree.ok) throw new Error(`tree ${tree.status}: ${(await tree.text().catch(() => '')).slice(0, 120)}`)
    const items = ((await tree.json()) as { tree?: Array<{ path?: string; type?: string }> }).tree || []
    // Skip DYNAMIC routes ([slug], [...catchall]) — they set per-item SEO via a
    // generateMetadata() function, not a static export, so a one-off rewrite is wrong.
    const pagePaths = items.filter(t => t.type === 'blob' && t.path && /^app\/.*page\.(tsx|jsx|ts|js)$/.test(t.path) && !t.path.includes('[')).map(t => t.path as string)
    const layoutPath = items.find(t => t.path === 'app/layout.tsx' || t.path === 'app/layout.jsx')?.path
    const fetchFile = async (path: string) => {
        const f = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(cfg.branch)}`)
        if (!f.ok) return null
        const j = await f.json() as { sha?: string; content?: string; encoding?: string }
        return { sha: j.sha || '', text: j.content && j.encoding === 'base64' ? Buffer.from(j.content, 'base64').toString('utf-8') : '' }
    }
    const pages: AppPage[] = []
    for (const p of pagePaths.slice(0, 60)) {
        const f = await fetchFile(p); if (!f) continue
        const md = parseAppMetadata(f.text)
        pages.push({ path: p, sha: f.sha, text: f.text, routePath: routeFromPath(p), title: md.title, description: md.description, hasExport: md.hasExport })
    }
    let layout: { title: string | null; description: string | null; template: string | null } | null = null
    if (layoutPath) {
        const lf = await fetchFile(layoutPath)
        if (lf) {
            const m = parseAppMetadata(lf.text)
            const body = metadataObjectBody(lf.text) || ''
            const titleObj = (body.match(/title\s*:\s*\{[\s\S]*?\}/) || [''])[0]
            // template like "%s | Flowmatic" — Next appends it to EVERY page title,
            // so per-page titles must NOT include the brand suffix (else doubled).
            layout = { title: m.title, description: m.description, template: tsStringField(titleObj, 'template') }
        }
    }
    return { pages, layout }
}

export async function runNextAppRouterMetaDedup(
    instanceId: string,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean; targetRoutes?: string[] } = {},
): Promise<GithubSeoResult> {
    const result: GithubSeoResult = { ok: false, integrationMissing: false, op: 'meta', scanned: 0, candidates: 0, changed: [], proposals: [], failures: [] }
    const cfg = await loadGithubConfig(instanceId, opts.agentId)
    if (!cfg) { result.integrationMissing = true; return result }
    let scan: { pages: AppPage[]; layout: { title: string | null; description: string | null; template: string | null } | null }
    try { scan = await listAppPages(cfg) } catch (err) { result.error = (err as Error).message; return result }
    const { pages, layout } = scan
    result.scanned = pages.length
    if (pages.length === 0) { result.ok = true; return result }   // not an App Router site

    const effTitle = (p: AppPage) => p.title || layout?.title || null
    const effDesc = (p: AppPage) => p.description || layout?.description || null
    const titleCount = new Map<string, number>(), descCount = new Map<string, number>()
    for (const p of pages) { const t = effTitle(p), d = effDesc(p); if (t) titleCount.set(t, (titleCount.get(t) || 0) + 1); if (d) descCount.set(d, (descCount.get(d) || 0) + 1) }
    // A page needs unique metadata when it has no own title/desc (inherits the
    // shared default) OR its effective value collides with another page.
    let cands = pages.filter(p => {
        if (p.routePath === '/') return false   // homepage legitimately owns the default
        const t = effTitle(p), d = effDesc(p)
        const dupTitle = !p.title || (!!t && (titleCount.get(t) || 0) > 1)
        const dupDesc = !p.description || (!!d && (descCount.get(d) || 0) > 1)
        return dupTitle || dupDesc
    })
    if (opts.targetRoutes?.length) cands = cands.filter(p => opts.targetRoutes!.some(r => p.routePath === r || p.routePath.endsWith(r.replace(/^\//, '/'))))
    result.candidates = cands.length
    if (cands.length === 0) { result.ok = true; return result }

    const apiKey = await getApiKeyForInstance(instanceId)
    const model = await resolveDirectModel(instanceId, 'yotzer')
    // Template-awareness: when the layout sets title.template ("%s | Brand"),
    // Next appends the brand to EVERY page title — so each per-page title must NOT
    // include it (else "… | Brand | Brand"). Derive the brand, tell the model not
    // to add it, and strip a trailing brand suffix defensively.
    const brand = opts.businessName || (layout?.template ? layout.template.replace(/%s/g, '').replace(/[|\-–—]/g, '').trim() : '') || 'Flowmatic'
    const hasTemplate = !!layout?.template
    const brandEsc = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stripBrand = (t: string) => hasTemplate ? t.replace(new RegExp(`\\s*[|\\-–—]\\s*${brandEsc}\\s*$`, 'i'), '').trim() : t
    const changes: Array<{ path: string; sha: string; content: string }> = []
    for (const p of cands.slice(0, 20)) {
        if (!apiKey) { result.failures.push({ path: p.path, error: 'no API key' }); continue }
        const md = parseAppMetadata(p.text)
        const hint = p.text.replace(/import[^\n]*\n/g, '').replace(/<[^>]+>/g, ' ').replace(/[{}();=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
        const brandRule = hasTemplate
            ? `אל תכללו את שם המותג "${brand}" בכותרת — הוא מתווסף אוטומטית על-ידי תבנית ה-layout (הכללתו תיצור כפל "| ${brand} | ${brand}").`
            : `כללו את שם המותג בסוף הכותרת.`
        const prompt = `אתם עורכי SEO מקצועיים. צרו כותרת ותיאור מטא ייחודיים בעברית לעמוד "${p.routePath}" של "${brand}".\nדרישות: כותרת ≤${hasTemplate ? 50 : 60} תווים, ייחודית לעמוד הזה בלבד, כוללת את הנושא המרכזי של העמוד. ${brandRule} תיאור 140-160 תווים, ייחודי, עם תועלת ו-CTA. אל תחזרו על נוסח של עמודים אחרים.\nJSON בלבד: {"title":"...","description":"..."}\n\nרמז לתוכן העמוד: ${hint}`
        const out = await callAnthropic(apiKey, model, prompt, 400)
        const j = extractJson(out) || {}
        const title = stripBrand(String(j.title || '').trim()).slice(0, 70)
        const description = String(j.description || '').trim().slice(0, 180)
        if (title.length < 5 || description.length < 60) { result.failures.push({ path: p.path, error: 'generation failed' }); continue }
        const edited = upsertAppMetadata(p.text, title, description, md.hasExport, md.titleIsObject, p.routePath)
        if (!edited || edited === p.text) { result.failures.push({ path: p.path, error: 'could not edit metadata safely (complex shape)' }); continue }
        changes.push({ path: p.path, sha: p.sha, content: edited })
        result.changed.push({ path: p.path, detail: `${p.routePath} → ${title}` })
    }
    if (changes.length && !opts.dryRun) {
        try { result.prUrl = await commitViaPR(cfg, 'meta-dedup', changes) } catch (err) { result.error = (err as Error).message; result.failures.push({ path: '(PR)', error: (err as Error).message }) }
    }
    result.ok = true
    return result
}

export async function runSeoGithubBatch(
    instanceId: string,
    op: GithubSeoOp,
    opts: { agentId?: string | null; businessName?: string; dryRun?: boolean; targetWords?: number } = {},
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

    // ── body_expand: deepen/expand thin pages (page-refresh parity) ──
    if (op === 'body_expand') {
        const target = opts.targetWords && opts.targetWords > 200 ? opts.targetWords : 800
        const cands = files.filter(f => { const { body, hasFm } = splitFrontmatter(f.text); return hasFm && countWords(body) < target })
        result.candidates = cands.length
        const changes: Array<{ path: string; sha: string; content: string }> = []
        for (const f of cands.slice(0, MAX_FILES_PER_RUN)) {
            if (!apiKey) { result.failures.push({ path: f.path, error: 'no API key' }); continue }
            const { fm, body } = splitFrontmatter(f.text)
            const before = countWords(body)
            const out = await callAnthropic(apiKey, model,
                `אתם עורכי תוכן SEO בכירים. הרחיבו והעמיקו את גוף המאמר הבא בעברית ל-~${target} מילים: שמרו על כל התוכן הקיים, הוסיפו עומק, כותרות H2 בפורמט שאלה, ומקטע "שאלות נפוצות" בסוף. אל תשנו את ה-frontmatter. החזירו אך ורק את גוף ה-markdown המורחב (ללא frontmatter, ללא code fences).\n\nכותרת: ${f.title}\nעסק: ${businessName}\n\nגוף קיים:\n${body.slice(0, 6000)}`,
                8000)
            const expanded = stripFences(out)
            const after = countWords(expanded)
            if (after <= before + 50) { result.failures.push({ path: f.path, error: 'expansion too small / empty' }); continue }
            const newText = rebuild(fm, expanded.startsWith('\n') ? expanded : '\n' + expanded + '\n')
            if (opts.dryRun) { result.changed.push({ path: f.path, detail: `${before}→${after} מילים` }); continue }
            changes.push({ path: f.path, sha: f.sha, content: newText })
            result.changed.push({ path: f.path, detail: `${before}→${after} מילים` })
        }
        if (!opts.dryRun && changes.length) {
            try { result.prUrl = await commitViaPR(cfg, 'body-expand', changes) } catch (err) { result.error = (err as Error).message; result.changed = []; result.failures.push({ path: '(commit)', error: (err as Error).message }) }
        }
        result.ok = result.changed.length > 0 || result.failures.length === 0
        return result
    }

    // ── image_alt: fill missing alt on inline markdown / <img> images ──
    if (op === 'image_alt') {
        const IMG_PER_FILE = 6
        const changes: Array<{ path: string; sha: string; content: string }> = []
        let scannedImgs = 0
        for (const f of files.slice(0, MAX_FILES_PER_RUN)) {
            const { fm, body, hasFm } = splitFrontmatter(f.text)
            if (!hasFm) continue
            // Collect alt-less images: markdown ![](url) with empty/whitespace alt, and <img> without alt=.
            const targets: Array<{ start: number; end: number; url: string; kind: 'md' | 'html' }> = []
            for (const m of body.matchAll(/!\[[ \t]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
                targets.push({ start: m.index!, end: m.index! + m[0].length, url: m[1], kind: 'md' })
            }
            for (const m of body.matchAll(/<img(?![^>]*\balt\s*=)[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
                targets.push({ start: m.index!, end: m.index! + m[0].length, url: m[1], kind: 'html' })
            }
            if (targets.length === 0) continue
            targets.sort((a, b) => a.start - b.start)
            const use = targets.slice(0, IMG_PER_FILE)
            scannedImgs += targets.length
            // Generate alts, then splice from the end so earlier offsets stay valid.
            const filled: Array<{ start: number; end: number; replacement: string; alt: string }> = []
            for (const t of use) {
                if (!apiKey) { result.failures.push({ path: f.path, error: 'no API key' }); break }
                const fname = decodeURIComponent(t.url.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]/g, ' ')
                const ctx = headingBefore(body, t.start)
                const out = await callAnthropic(apiKey, model,
                    `כתבו טקסט חלופי (alt) קצר בעברית, עד 12 מילים, המתאר ענייני את תוכן התמונה לנגישות ו-SEO. JSON בלבד: {"alt":"..."}\n\nעסק: ${businessName}\nכותרת עמוד: ${f.title}\nכותרת קטע: ${ctx || '—'}\nשם קובץ: ${fname || '—'}`,
                    200)
                const alt = (extractJson(out)?.alt || '').toString().trim().replace(/["\n]/g, ' ').slice(0, 120)
                if (alt.length < 3) { result.failures.push({ path: f.path, error: `no alt for ${t.url}` }); continue }
                const orig = body.slice(t.start, t.end)
                const replacement = t.kind === 'md'
                    ? orig.replace(/!\[[ \t]*\]/, `![${alt}]`)
                    : orig.replace(/<img/i, `<img alt="${alt}"`)
                filled.push({ start: t.start, end: t.end, replacement, alt })
            }
            if (filled.length === 0) continue
            let newBody = body
            for (const fl of filled.sort((a, b) => b.start - a.start)) {
                newBody = newBody.slice(0, fl.start) + fl.replacement + newBody.slice(fl.end)
            }
            const newText = rebuild(fm, newBody)
            if (opts.dryRun) { result.changed.push({ path: f.path, detail: filled.map(x => x.alt).join(' · ') }); continue }
            changes.push({ path: f.path, sha: f.sha, content: newText })
            result.changed.push({ path: f.path, detail: `${filled.length} תמונות: ${filled.map(x => x.alt).join(' · ')}` })
        }
        result.candidates = scannedImgs
        if (!opts.dryRun && changes.length) {
            try { result.prUrl = await commitViaPR(cfg, 'image-alt', changes) } catch (err) { result.error = (err as Error).message; result.changed = []; result.failures.push({ path: '(commit)', error: (err as Error).message }) }
        }
        result.ok = result.changed.length > 0 || result.failures.length === 0
        return result
    }

    // ── answer_first: prepend a concise answer paragraph (AEO/featured snippet) ──
    if (op === 'answer_first') {
        const MARK = '<!-- answer-first -->'
        const cands = files.filter(f => { const { body, hasFm } = splitFrontmatter(f.text); return hasFm && !body.includes(MARK) })
        result.candidates = cands.length
        const changes: Array<{ path: string; sha: string; content: string }> = []
        for (const f of cands.slice(0, MAX_FILES_PER_RUN)) {
            if (!apiKey) { result.failures.push({ path: f.path, error: 'no API key' }); continue }
            const { fm, body } = splitFrontmatter(f.text)
            const snippet = body.replace(/[#*_>`[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500)
            const out = await callAnthropic(apiKey, model,
                `כתבו פסקת תשובה ישירה וקצרה (40-55 מילים) בעברית שעונה מיד על שאלת/נושא העמוד — מתאים ל-Featured Snippet ולמנועי AI. ללא מילות מעבר, ישר לעניין. JSON בלבד: {"answer":"..."}\n\nכותרת: ${f.title}\nתוכן: ${snippet}`,
                400)
            const answer = (extractJson(out)?.answer || '').toString().trim()
            if (countWords(answer) < 15) { result.failures.push({ path: f.path, error: 'no answer generated' }); continue }
            const block = `${MARK}\n> **בקצרה:** ${answer}\n`
            // Insert after a leading H1 if present, else at the very top of the body.
            const h1 = body.match(/^\s*(#\s+[^\n]+\n)/)
            const newBody = h1
                ? body.slice(0, h1.index! + h1[0].length) + '\n' + block + '\n' + body.slice(h1.index! + h1[0].length)
                : block + '\n' + body.replace(/^\n+/, '')
            const newText = rebuild(fm, newBody)
            if (opts.dryRun) { result.changed.push({ path: f.path, detail: answer }); continue }
            changes.push({ path: f.path, sha: f.sha, content: newText })
            result.changed.push({ path: f.path, detail: answer })
        }
        if (!opts.dryRun && changes.length) {
            try { result.prUrl = await commitViaPR(cfg, 'answer-first', changes) } catch (err) { result.error = (err as Error).message; result.changed = []; result.failures.push({ path: '(commit)', error: (err as Error).message }) }
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