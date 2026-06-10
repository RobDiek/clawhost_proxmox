/**
 * Exec-service — on-VPS sovereign execution service (tenant sovereignty S1).
 *
 * Replaces the central root-SSH execution path. The central API (stageExecutor,
 * when instances.exec_mode='vps') calls these granular primitives over HTTPS with
 * the instance's openclaw_token instead of SSHing in AS ROOT. This service runs as
 * the **openclaw** user (NOT root) — so it does locally exactly what the root-SSH
 * block did, minus chown (it already owns the files):
 *   POST /exec/reset       — pre-flight workspace wipe + cross-brand prune + BRAND.md
 *   POST /exec/agent       — `openclaw agent --json` (CLI path; LLM via local litellm)
 *   GET/PUT /exec/file     — read/write an allowlisted workspace / research-data file
 *   GET /exec/session-draft— assistant-text fallback from the latest session jsonl
 *   GET /exec/tools        — `openclaw mcp list --json`
 *   POST /exec/anthropic   — useDirectApi path: proxy to the LOCAL litellm (the
 *                            tenant key stays on the VPS — center never sees it)
 *
 * Auth: Bearer = the instance openclaw_token (gateway.auth.token), constant-time
 * compared — mirror of sovereign-store. nginx proxies /exec/* on the agent vhost.
 * Loopback only. Node built-ins + global fetch (node 20+) — zero npm deps.
 *
 * Env:
 *   EXEC_PORT          loopback port                       (default 3101)
 *   EXEC_HOME          openclaw home                       (default /home/openclaw/.openclaw)
 *   EXEC_TOKEN_FILE    dedicated token file (fallback openclaw.json gateway.auth.token)
 *   EXEC_OPENCLAW_JSON openclaw.json path                  (default <home>/openclaw.json)
 *   EXEC_LITELLM_URL   local litellm base                  (default http://127.0.0.1:4000)
 */
'use strict'

const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const PORT = parseInt(process.env.EXEC_PORT || '3101', 10)
const HOME = process.env.EXEC_HOME || '/home/openclaw/.openclaw'
const TOKEN_FILE = process.env.EXEC_TOKEN_FILE || '/home/openclaw/.openclaw/sovereign/token'
const OPENCLAW_JSON = process.env.EXEC_OPENCLAW_JSON || '/home/openclaw/.openclaw/openclaw.json'
const LITELLM_URL = (process.env.EXEC_LITELLM_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '')

const MAX_BODY_BYTES = 16 * 1024 * 1024 // 16MB (prompts can be large)
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/      // agentId / sessionId / brand slug
const BRAND_RE = /^[A-Za-z0-9_-]{1,64}$/

// ── Auth token (resolved once; fail-closed) ────────────────────────────────
function loadExpectedToken() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim()
            if (t) return t
        }
    } catch (e) { console.error('[exec] token file read failed:', e.message) }
    try {
        const j = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf8'))
        const t = j && j.gateway && j.gateway.auth && j.gateway.auth.token
        if (t) return String(t).trim()
    } catch (e) { console.error('[exec] openclaw.json token read failed:', e.message) }
    return ''
}
const EXPECTED_TOKEN = loadExpectedToken()
if (!EXPECTED_TOKEN) {
    console.error('[exec] FATAL: no auth token resolved — refusing to start.')
    process.exit(1)
}
function tokenOk(provided) {
    if (!provided) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(EXPECTED_TOKEN)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}

// ── Path allowlist — only under HOME, no traversal ─────────────────────────
function safePath(p) {
    if (typeof p !== 'string' || !p || p.includes('\0')) return null
    const resolved = path.resolve(HOME, p.replace(/^\/+/, ''))
    if (resolved !== HOME && !resolved.startsWith(HOME + path.sep)) return null
    return resolved
}

// ── HTTP helpers ───────────────────────────────────────────────────────────
function send(res, status, obj) {
    const body = JSON.stringify(obj)
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
    res.end(body)
}
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0
        const chunks = []
        req.on('data', (c) => {
            size += c.length
            if (size > MAX_BODY_BYTES) { reject(new Error('body too large')); req.destroy(); return }
            chunks.push(c)
        })
        req.on('end', () => {
            if (!chunks.length) return resolve(undefined)
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
            catch (e) { reject(new Error('invalid JSON body')) }
        })
        req.on('error', reject)
    })
}
function runBash(script, timeoutMs, cb) {
    execFile('bash', ['-c', script], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        cb(err, (stdout || '') + (stderr || ''))
    })
}

// ── Primitives ─────────────────────────────────────────────────────────────

// Pre-flight workspace wipe + cross-brand prune + BRAND.md restore (was the
// root-SSH block in stageExecutor; runs as openclaw → no chown needed).
function doReset(agentId, brandSlug, cb) {
    const A = `${HOME}/agents/${agentId}`
    const W = `${HOME}/workspace`
    const script = [
        `rm -rf ${A}/sessions/* 2>/dev/null`,
        `rm -rf ${A}/output/* 2>/dev/null`,
        `mkdir -p ${A}/sessions`,
        `rm -rf ${W}/content/* 2>/dev/null`,
        `rm -rf ${W}/memory/* 2>/dev/null`,
        `rm -rf ${W}/state/* 2>/dev/null`,
        `rm -f ${W}/STRATEGY.md 2>/dev/null`,
        `if [ -d ${W}/brands ]; then for d in ${W}/brands/*/; do slug=$(basename "$d"); if [ "$slug" != "${brandSlug}" ]; then rm -rf "$d" 2>/dev/null; fi; done; fi`,
        `if [ -f "${W}/brands/${brandSlug}/BRAND.md" ]; then cp "${W}/brands/${brandSlug}/BRAND.md" ${W}/BRAND.md; fi`,
        `echo RESET_OK`,
    ].join('\n')
    runBash(script, 20000, (err, out) => cb(err, out))
}

// Run the openclaw CLI agent (prompt via temp file to dodge arg limits).
function doAgent(agentId, sessionId, prompt, timeoutSec, cb) {
    const pf = path.join(os.tmpdir(), `exec-prompt-${sessionId}.txt`)
    try { fs.writeFileSync(pf, String(prompt), 'utf8') }
    catch (e) { return cb(e, '') }
    const script = `timeout ${timeoutSec} openclaw agent --agent ${agentId} --session-id ${sessionId} -m "$(cat ${pf})" --json 2>&1; rc=$?; rm -f ${pf}; exit $rc`
    runBash(script, (timeoutSec + 30) * 1000, (err, out) => cb(null, out))
}

// Assistant-text fallback from the latest session jsonl (python on the VPS).
function doSessionDraft(agentId, cb) {
    const script = `ls -t ${HOME}/agents/${agentId}/sessions/*.jsonl 2>/dev/null | head -1 | xargs -r cat 2>/dev/null | python3 -c "
import json,sys
out=[]
for line in sys.stdin:
    try:
        j=json.loads(line)
        if j.get('type')=='message' and j.get('message',{}).get('role')=='assistant':
            for c in j['message'].get('content',[]):
                if isinstance(c,dict) and c.get('type')=='text':
                    t=c.get('text','').strip()
                    if len(t)>50: out.append(t)
    except: pass
print('\\n\\n'.join(out))
" 2>/dev/null || echo ""`
    runBash(script, 25000, (err, out) => cb(null, out))
}

// Map a central model id to a litellm alias (the keys live in litellm-config).
function litellmModel(m) {
    const s = String(m || '').toLowerCase()
    if (s.includes('opus')) return 'opus'
    if (s.includes('haiku')) return 'haiku'
    if (s.includes('sonnet')) return 'sonnet'
    if (s.includes('gpt-4o-mini') || s.includes('mini')) return 'gpt4o-mini'
    if (s.includes('gpt')) return 'gpt4o'
    return 'default'
}

// useDirectApi proxy → local litellm (tenant key stays on the VPS).
async function doAnthropic(model, prompt, maxTokens) {
    try {
        const res = await fetch(`${LITELLM_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EXPECTED_TOKEN}` },
            body: JSON.stringify({
                model: litellmModel(model),
                messages: [{ role: 'user', content: String(prompt) }],
                max_tokens: maxTokens || 4096,
            }),
            signal: AbortSignal.timeout(720000),
        })
        if (!res.ok) {
            const errorText = await res.text().catch(() => '')
            return { ok: false, status: res.status, errorText: errorText.slice(0, 2000) }
        }
        const j = await res.json()
        const text = (((j.choices || [])[0] || {}).message || {}).content || ''
        return { ok: true, text }
    } catch (e) {
        return { ok: false, status: 503, errorText: `litellm proxy failed: ${e.message}` }
    }
}

// ── Router ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost')
        const route = url.pathname.replace(/\/+$/, '')

        if (req.method === 'GET' && route === '/exec/health') {
            return send(res, 200, { ok: true, service: 'exec-service' })
        }

        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
        if (!tokenOk(token)) return send(res, 401, { error: 'unauthorized' })

        // POST /exec/reset { agentId, brandSlug }
        if (req.method === 'POST' && route === '/exec/reset') {
            const b = await readJsonBody(req) || {}
            if (!ID_RE.test(String(b.agentId || '')) || !BRAND_RE.test(String(b.brandSlug || '__none__')))
                return send(res, 400, { error: 'bad agentId/brandSlug' })
            return doReset(String(b.agentId), String(b.brandSlug || '__none__'), (err, out) => {
                if (err || !/RESET_OK/.test(out)) return send(res, 500, { error: 'reset failed', detail: (out || '').slice(-500) })
                send(res, 200, { ok: true })
            })
        }

        // POST /exec/agent { agentId, sessionId, prompt, timeoutSec }
        if (req.method === 'POST' && route === '/exec/agent') {
            const b = await readJsonBody(req) || {}
            if (!ID_RE.test(String(b.agentId || '')) || !ID_RE.test(String(b.sessionId || '')))
                return send(res, 400, { error: 'bad agentId/sessionId' })
            if (typeof b.prompt !== 'string' || !b.prompt) return send(res, 400, { error: 'missing prompt' })
            const t = Math.min(Math.max(parseInt(b.timeoutSec, 10) || 540, 30), 1800)
            return doAgent(String(b.agentId), String(b.sessionId), b.prompt, t, (err, out) => {
                send(res, 200, { stdout: out || '' })
            })
        }

        // GET/PUT /exec/file
        if (route === '/exec/file') {
            if (req.method === 'GET') {
                const sp = safePath(url.searchParams.get('path') || '')
                if (!sp) return send(res, 400, { error: 'bad path' })
                if (!fs.existsSync(sp)) return send(res, 404, { error: 'not found' })
                try { return send(res, 200, { content: fs.readFileSync(sp, 'utf8') }) }
                catch (e) { return send(res, 500, { error: e.message }) }
            }
            if (req.method === 'PUT') {
                const b = await readJsonBody(req) || {}
                const sp = safePath(String(b.path || ''))
                if (!sp) return send(res, 400, { error: 'bad path' })
                if (typeof b.body !== 'string') return send(res, 400, { error: 'missing body' })
                try {
                    fs.mkdirSync(path.dirname(sp), { recursive: true })
                    fs.writeFileSync(sp, b.body, 'utf8')
                    return send(res, 200, { ok: true })
                } catch (e) { return send(res, 500, { error: e.message }) }
            }
            return send(res, 405, { error: 'method not allowed' })
        }

        // GET /exec/session-draft?agentId=
        if (req.method === 'GET' && route === '/exec/session-draft') {
            const agentId = url.searchParams.get('agentId') || ''
            if (!ID_RE.test(agentId)) return send(res, 400, { error: 'bad agentId' })
            return doSessionDraft(agentId, (err, out) => send(res, 200, { draft: (out || '').trim() }))
        }

        // GET /exec/tools
        if (req.method === 'GET' && route === '/exec/tools') {
            return runBash(`openclaw mcp list --json 2>/dev/null || echo "{}"`, 15000, (err, out) => {
                let names = ''
                try {
                    const parsed = JSON.parse((out || '{}').trim() || '{}')
                    names = (Array.isArray(parsed) ? parsed.map((s) => s.name || s.id || '') : Object.keys(parsed)).join(',').toLowerCase()
                } catch { names = '' }
                send(res, 200, {
                    hasBrave: names.includes('brave'),
                    hasDataforseo: names.includes('dataforseo'),
                    hasFirecrawl: names.includes('firecrawl'),
                    hasGsc: names.includes('gsc'),
                })
            })
        }

        // POST /exec/anthropic { model, prompt, maxTokens }
        if (req.method === 'POST' && route === '/exec/anthropic') {
            const b = await readJsonBody(req) || {}
            if (typeof b.prompt !== 'string' || !b.prompt) return send(res, 400, { error: 'missing prompt' })
            const r = await doAnthropic(b.model, b.prompt, parseInt(b.maxTokens, 10) || 4096)
            return send(res, 200, r)
        }

        return send(res, 404, { error: 'no such route' })
    } catch (err) {
        const msg = (err && err.message) || 'error'
        const code = msg === 'body too large' ? 413 : msg.includes('JSON') ? 400 : 500
        return send(res, code, { error: msg })
    }
})

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[exec] listening on 127.0.0.1:${PORT}, home=${HOME}, litellm=${LITELLM_URL}`)
})
