/**
 * General GitHub code/content executor — "any code change, via PR".
 *
 * GitHub parity for the long tail of `website_change` / `other` tasks that the
 * canned SEO ops (seoGithubBatch) don't cover: inject a specific JSON-LD into
 * the site head/layout, add a redirect/config, tweak a component, etc. For a
 * WordPress tenant these land as a manual brief; for a GitHub-connected tenant
 * this runs a two-pass LLM and opens a Pull Request implementing the change.
 *
 * SAFETY: every change lands on a NEW branch + PR (never a push to default).
 * Nothing auto-merges — the owner reviews + merges. Worst case = a reviewable
 * PR, never a broken live site. Bounded: reads ≤6 files, edits ≤5.
 *
 * Returns noConfidentEdit=true when the model can't produce a safe edit — the
 * caller then falls back to the normal manual brief (honest, not a fake done).
 */
import { loadGithubConfig, type GithubCfg } from './seoGithubBatch'
import { getApiKeyForInstance, resolveDirectModel } from '@/controllers/hosting/agentSetup'

const MAX_READ = 6
const MAX_EDIT = 5
const PER_FILE_CHARS = 14000
// Source files worth reasoning about; skip vendored / build / lock noise.
const SKIP_DIR = /(^|\/)(node_modules|\.next|\.git|dist|build|out|vendor|coverage|\.cache)\//
const SRC_EXT = /\.(tsx?|jsx?|astro|vue|svelte|html?|md|mdx|json|ya?ml|toml|css|scss)$/i

export interface GithubCodeChangeResult {
    ok: boolean
    integrationMissing: boolean
    noConfidentEdit?: boolean
    prUrl?: string
    edits: Array<{ path: string; detail: string }>
    summaryHe?: string
    error?: string
}

const TRANSIENT = new Set([429, 500, 502, 503, 504])
async function gh(cfg: GithubCfg, path: string, init: RequestInit = {}, tries = 3): Promise<Response> {
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`
    let lastErr: Error | null = null
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, {
                ...init,
                headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Flowmatic-Code', ...(init.headers || {}) },
                signal: AbortSignal.timeout(30000),
            })
            if (TRANSIENT.has(res.status) && i < tries - 1) { await new Promise(r => setTimeout(r, 1200 * (i + 1))); continue }
            return res
        } catch (err) { lastErr = err as Error; if (i < tries - 1) await new Promise(r => setTimeout(r, 1200 * (i + 1))) }
    }
    if (lastErr) throw lastErr
    throw new Error('gh fetch exhausted')
}

async function callAnthropic(apiKey: string, model: string, prompt: string, maxTokens: number): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(300000),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}`)
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
    return (data.content?.find(c => c.type === 'text')?.text || '').trim()
}
function extractJson(text: string): any | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const raw = fenced ? fenced[1] : text
    const f = raw.indexOf('{'), l = raw.lastIndexOf('}')
    if (f < 0 || l <= f) return null
    try { return JSON.parse(raw.substring(f, l + 1)) } catch { return null }
}

async function getFile(cfg: GithubCfg, path: string): Promise<{ sha: string; text: string } | null> {
    const r = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(cfg.branch)}`)
    if (!r.ok) return null
    const j = await r.json() as { sha?: string; content?: string; encoding?: string }
    if (!j.sha || j.encoding !== 'base64') return null
    return { sha: j.sha, text: Buffer.from(j.content || '', 'base64').toString('utf-8') }
}

async function commitViaPR(cfg: GithubCfg, label: string, prTitle: string, prBody: string, edits: Array<{ path: string; sha: string; content: string }>): Promise<string> {
    const refRes = await gh(cfg, `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`)
    if (!refRes.ok) throw new Error(`get ref ${refRes.status}`)
    const baseSha = ((await refRes.json()) as { object?: { sha?: string } }).object?.sha
    if (!baseSha) throw new Error('no base sha')
    const newBranch = `clawflow/${label}-${baseSha.slice(0, 7)}`
    const cr = await gh(cfg, `/repos/${cfg.repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) })
    if (!cr.ok && cr.status !== 422) throw new Error(`create branch ${cr.status}: ${(await cr.text().catch(() => '')).slice(0, 160)}`)
    for (const e of edits) {
        const put = await gh(cfg, `/repos/${cfg.repo}/contents/${encodeURIComponent(e.path).replace(/%2F/g, '/')}`, {
            method: 'PUT',
            body: JSON.stringify({ message: `${prTitle}: ${e.path.split('/').pop()}`, content: Buffer.from(e.content, 'utf-8').toString('base64'), sha: e.sha || undefined, branch: newBranch }),
        })
        if (!put.ok) throw new Error(`put ${e.path} ${put.status}: ${(await put.text().catch(() => '')).slice(0, 160)}`)
    }
    const pr = await gh(cfg, `/repos/${cfg.repo}/pulls`, { method: 'POST', body: JSON.stringify({ title: prTitle, head: newBranch, base: cfg.branch, body: prBody }) })
    if (!pr.ok) { if (pr.status === 422) return `branch:${newBranch}`; throw new Error(`open PR ${pr.status}: ${(await pr.text().catch(() => '')).slice(0, 160)}`) }
    return ((await pr.json()) as { html_url?: string }).html_url || `branch:${newBranch}`
}

export async function runGithubCodeChange(
    instanceId: string,
    task: { id?: string; title?: string; summary?: string; actionPlan?: Array<{ step?: string }> },
    opts: { agentId?: string | null; dryRun?: boolean } = {},
): Promise<GithubCodeChangeResult> {
    const out: GithubCodeChangeResult = { ok: false, integrationMissing: false, edits: [] }
    const cfg = await loadGithubConfig(instanceId, opts.agentId)
    if (!cfg) { out.integrationMissing = true; return out }

    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) { out.noConfidentEdit = true; out.error = 'no API key'; return out }
    const model = await resolveDirectModel(instanceId, 'menateach')

    const taskText = `${task.title || ''}\n${task.summary || ''}\n${(task.actionPlan || []).map(s => '• ' + (s.step || '')).join('\n')}`.trim()

    // ── 1. file tree ──
    const treeRes = await gh(cfg, `/repos/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`)
    if (!treeRes.ok) { out.error = `tree ${treeRes.status}`; out.noConfidentEdit = true; return out }
    const tree = (await treeRes.json() as { tree?: Array<{ path?: string; type?: string }> }).tree || []
    const paths = tree.filter(t => t.type === 'blob' && t.path && !SKIP_DIR.test('/' + t.path) && SRC_EXT.test(t.path)).map(t => t.path as string)
    if (paths.length === 0) { out.error = 'no source files'; out.noConfidentEdit = true; return out }

    // ── 2. LLM picks which files to read ──
    const pick = extractJson(await callAnthropic(apiKey, model,
        `You are a senior engineer implementing a change in the GitHub repo "${cfg.repo}". Decide which existing files to READ to implement the task. Return JSON only: {"files":["path",...](max ${MAX_READ}),"reason":"..."}\n\nTASK:\n${taskText}\n\nFILE TREE (${paths.length} source files):\n${paths.slice(0, 600).join('\n')}`,
        1500))
    const wanted: string[] = Array.isArray(pick?.files) ? pick.files.filter((p: any) => typeof p === 'string' && paths.includes(p)).slice(0, MAX_READ) : []
    if (wanted.length === 0) { out.noConfidentEdit = true; out.error = 'model picked no files'; return out }

    const loaded: Array<{ path: string; sha: string; text: string }> = []
    for (const p of wanted) { const f = await getFile(cfg, p); if (f) loaded.push({ path: p, sha: f.sha, text: f.text }) }
    if (loaded.length === 0) { out.noConfidentEdit = true; out.error = 'could not read picked files'; return out }

    // ── 3. LLM produces edits (FULL new content per edited file) ──
    const filesBlock = loaded.map(f => `=== FILE: ${f.path} ===\n${f.text.slice(0, PER_FILE_CHARS)}${f.text.length > PER_FILE_CHARS ? '\n…[truncated]' : ''}`).join('\n\n')
    const editPrompt = `You are a senior engineer. Implement the TASK by editing the files below. Rules:
- Return the COMPLETE new content of each file you change (not a diff).
- Make the MINIMAL change that fully implements the task; preserve everything else byte-for-byte.
- Only edit files from the provided set. Do NOT invent new files unless strictly required (then give full content).
- Valid JSON-LD / valid syntax. If the task is structured data, inject a <script type="application/ld+json"> into the document head/layout.
- If you are NOT confident you can implement it correctly + safely from these files, set "confident": false and edits: [].
- prTitle/prBody in English; summaryHe is a 1-2 sentence Hebrew summary of what changed.

Return JSON ONLY:
{"confident": true|false, "edits":[{"path":"...","newContent":"<full file>"}], "prTitle":"...", "prBody":"...", "summaryHe":"..."}

TASK:
${taskText}

FILES:
${filesBlock}`
    const gen = extractJson(await callAnthropic(apiKey, model, editPrompt, 32000))
    if (!gen || gen.confident === false || !Array.isArray(gen.edits) || gen.edits.length === 0) {
        out.noConfidentEdit = true
        out.summaryHe = typeof gen?.summaryHe === 'string' ? gen.summaryHe : undefined
        return out
    }

    // Map edits back to known shas (only allow editing files we read).
    const shaByPath = new Map(loaded.map(f => [f.path, f.sha]))
    const edits: Array<{ path: string; sha: string; content: string }> = []
    for (const e of (gen.edits as Array<{ path?: string; newContent?: string }>).slice(0, MAX_EDIT)) {
        if (!e.path || typeof e.newContent !== 'string' || e.newContent.length < 5) continue
        edits.push({ path: e.path, sha: shaByPath.get(e.path) || '', content: e.newContent })
    }
    if (edits.length === 0) { out.noConfidentEdit = true; return out }

    if (opts.dryRun) {
        out.ok = true
        out.edits = edits.map(e => ({ path: e.path, detail: `${e.content.length} chars (dry-run, no PR)` }))
        out.summaryHe = typeof gen.summaryHe === 'string' ? gen.summaryHe : undefined
        return out
    }

    // ── 4. open PR ──
    try {
        const label = `task-${(task.id || 'change').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)}`
        out.prUrl = await commitViaPR(cfg, label, String(gen.prTitle || 'Flowmatic automated change'), String(gen.prBody || 'Automated change by Flowmatic. Review and merge.'), edits)
    } catch (err) { out.error = (err as Error).message; out.noConfidentEdit = true; return out }

    out.ok = true
    out.edits = edits.map(e => ({ path: e.path, detail: 'updated' }))
    out.summaryHe = typeof gen.summaryHe === 'string' ? gen.summaryHe : undefined
    return out
}