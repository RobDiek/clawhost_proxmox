/**
 * Sovereign-store — on-VPS canonical store for tenant content (Phase 2).
 *
 * Part of the tenant-sovereignty re-architecture (flowmatic/roadmap/16 + /17).
 * Goal: research_data / agent_outputs / brand_books become canonical ON THE
 * TENANT'S VPS, not in central Postgres. This is the storage half: a tiny
 * loopback HTTP service backed by SQLite (WAL) that the VPS owns. nginx proxies
 * `/sovereign/*` on the agent subdomain to this service. The central API reaches
 * it over HTTPS during the dual-write (P2.1) and read-flip (P2.2) windows; the
 * on-VPS orchestrator (P2.3) reads/writes it directly.
 *
 * Auth: Bearer = the instance's openclaw_token (the same value in the VPS's
 * openclaw.json `gateway.auth.token` and in central `instances.openclaw_token`,
 * encrypted). Constant-time compared — mirror of services dfsRelay, inverted
 * direction (center → VPS). No token, no access.
 *
 * Dependencies: better-sqlite3 only (native). Uses Node's built-in http — no
 * web framework — to keep the on-VPS supply chain minimal.
 *
 * Env:
 *   SOVEREIGN_PORT       loopback port to listen on            (default 3100)
 *   SOVEREIGN_DB         sqlite file path                      (default /home/openclaw/.openclaw/data/sovereign.db)
 *   SOVEREIGN_TOKEN_FILE file whose trimmed contents = expected Bearer token
 *                        (default /home/openclaw/.openclaw/sovereign/token)
 *   SOVEREIGN_OPENCLAW_JSON fallback source for the token if the token file is
 *                        absent — reads .gateway.auth.token
 *                        (default /home/openclaw/.openclaw/openclaw.json)
 *
 * Data model (deliberately thin; typed columns on `outputs` so the P2.2 read
 * flip can filter משימות פעילות by status/type without a schema churn):
 *   singletons(scope_id, kind, body, updated_at)         PK(scope_id, kind)
 *     - kind 'research_data' | 'brand_book', scope_id = agent id, body = full JSON
 *   outputs(id, scope_id, type, status, body, created_at, updated_at)  PK(id)
 *     - one agent_outputs row each; body = full row JSON
 */
'use strict'

const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const PORT = parseInt(process.env.SOVEREIGN_PORT || '3100', 10)
const DB_PATH =
    process.env.SOVEREIGN_DB || '/home/openclaw/.openclaw/data/sovereign.db'
const TOKEN_FILE =
    process.env.SOVEREIGN_TOKEN_FILE ||
    '/home/openclaw/.openclaw/sovereign/token'
const OPENCLAW_JSON =
    process.env.SOVEREIGN_OPENCLAW_JSON ||
    '/home/openclaw/.openclaw/openclaw.json'

const MAX_BODY_BYTES = 8 * 1024 * 1024 // 8MB cap per request
const VALID_KINDS = new Set(['research_data', 'brand_book'])
const SCOPE_RE = /^[A-Za-z0-9_-]{1,64}$/
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

// ── Expected auth token ────────────────────────────────────────────────────
// Resolved once at startup. Prefer the dedicated token file; fall back to the
// gateway token in openclaw.json so a fresh install works even before the file
// is dropped. Empty token => service refuses ALL requests (fail closed).
function loadExpectedToken() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim()
            if (t) return t
        }
    } catch (e) {
        console.error('[sovereign] token file read failed:', e.message)
    }
    try {
        const j = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf8'))
        const t = j && j.gateway && j.gateway.auth && j.gateway.auth.token
        if (t) return String(t).trim()
    } catch (e) {
        console.error('[sovereign] openclaw.json token read failed:', e.message)
    }
    return ''
}

const EXPECTED_TOKEN = loadExpectedToken()
if (!EXPECTED_TOKEN) {
    console.error(
        '[sovereign] FATAL: no auth token resolved (token file + openclaw.json both empty). Refusing to start.'
    )
    process.exit(1)
}

function tokenOk(provided) {
    if (!provided) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(EXPECTED_TOKEN)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}

// ── DB ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.exec(`
    CREATE TABLE IF NOT EXISTS singletons (
        scope_id   TEXT NOT NULL,
        kind       TEXT NOT NULL,
        body       TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope_id, kind)
    );
    CREATE TABLE IF NOT EXISTS outputs (
        id         TEXT PRIMARY KEY,
        scope_id   TEXT NOT NULL,
        type       TEXT,
        status     TEXT,
        body       TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outputs_scope_status_idx ON outputs (scope_id, status);
    CREATE INDEX IF NOT EXISTS outputs_scope_type_idx   ON outputs (scope_id, type);
`)

const stmts = {
    getSingleton: db.prepare(
        'SELECT body, updated_at FROM singletons WHERE scope_id = ? AND kind = ?'
    ),
    putSingleton: db.prepare(`
        INSERT INTO singletons (scope_id, kind, body, updated_at)
        VALUES (@scope, @kind, @body, @now)
        ON CONFLICT(scope_id, kind) DO UPDATE SET body = @body, updated_at = @now
    `),
    getOutput: db.prepare('SELECT body FROM outputs WHERE id = ?'),
    putOutput: db.prepare(`
        INSERT INTO outputs (id, scope_id, type, status, body, created_at, updated_at)
        VALUES (@id, @scope, @type, @status, @body, @createdAt, @now)
        ON CONFLICT(id) DO UPDATE SET
            scope_id = @scope, type = @type, status = @status,
            body = @body, created_at = @createdAt, updated_at = @now
    `),
    countSingletons: db.prepare('SELECT count(*) AS n FROM singletons'),
    countOutputs: db.prepare('SELECT count(*) AS n FROM outputs')
}

// outputs list with optional status/type filters, newest first
function listOutputs(scope, status, type) {
    let sql = 'SELECT body FROM outputs WHERE scope_id = ?'
    const args = [scope]
    if (status) {
        sql += ' AND status = ?'
        args.push(status)
    }
    if (type) {
        sql += ' AND type = ?'
        args.push(type)
    }
    sql += ' ORDER BY COALESCE(created_at, updated_at) DESC LIMIT 1000'
    return db.prepare(sql).all(...args)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────
function send(res, status, obj) {
    const body = JSON.stringify(obj)
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    })
    res.end(body)
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0
        const chunks = []
        req.on('data', (c) => {
            size += c.length
            if (size > MAX_BODY_BYTES) {
                reject(new Error('body too large'))
                req.destroy()
                return
            }
            chunks.push(c)
        })
        req.on('end', () => {
            if (!chunks.length) return resolve(undefined)
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch (e) {
                reject(new Error('invalid JSON body'))
            }
        })
        req.on('error', reject)
    })
}

// ── Router ────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost')
        const route = url.pathname.replace(/\/+$/, '') // strip trailing slash

        // Liveness — no auth, no data leak.
        if (req.method === 'GET' && route === '/sovereign/health') {
            return send(res, 200, { ok: true, service: 'sovereign-store' })
        }

        // Everything else requires the instance token.
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
        if (!tokenOk(token)) return send(res, 401, { error: 'unauthorized' })

        // Authenticated counts (parity helper) — no tenant content returned.
        if (req.method === 'GET' && route === '/sovereign/stats') {
            return send(res, 200, {
                ok: true,
                singletons: stmts.countSingletons.get().n,
                outputs: stmts.countOutputs.get().n
            })
        }

        // ── singletons (research_data / brand_book) ──
        if (route === '/sovereign/singleton') {
            const scope = url.searchParams.get('scope') || ''
            const kind = url.searchParams.get('kind') || ''
            if (!SCOPE_RE.test(scope) || !VALID_KINDS.has(kind)) {
                return send(res, 400, { error: 'bad scope or kind' })
            }
            if (req.method === 'GET') {
                const row = stmts.getSingleton.get(scope, kind)
                if (!row) return send(res, 404, { error: 'not found' })
                return send(res, 200, {
                    body: JSON.parse(row.body),
                    updatedAt: row.updated_at
                })
            }
            if (req.method === 'PUT') {
                const payload = await readJsonBody(req)
                if (payload === undefined || payload.body === undefined) {
                    return send(res, 400, { error: 'missing body' })
                }
                stmts.putSingleton.run({
                    scope,
                    kind,
                    body: JSON.stringify(payload.body),
                    now: Date.now()
                })
                return send(res, 200, { ok: true })
            }
            return send(res, 405, { error: 'method not allowed' })
        }

        // ── single output by id ──
        if (route === '/sovereign/output') {
            if (req.method === 'GET') {
                const id = url.searchParams.get('id') || ''
                if (!ID_RE.test(id)) return send(res, 400, { error: 'bad id' })
                const row = stmts.getOutput.get(id)
                if (!row) return send(res, 404, { error: 'not found' })
                return send(res, 200, { body: JSON.parse(row.body) })
            }
            if (req.method === 'PUT') {
                const p = await readJsonBody(req)
                if (
                    !p ||
                    !ID_RE.test(String(p.id || '')) ||
                    !SCOPE_RE.test(String(p.scope || '')) ||
                    p.body === undefined
                ) {
                    return send(res, 400, { error: 'missing id/scope/body' })
                }
                stmts.putOutput.run({
                    id: String(p.id),
                    scope: String(p.scope),
                    type: p.type == null ? null : String(p.type),
                    status: p.status == null ? null : String(p.status),
                    body: JSON.stringify(p.body),
                    createdAt:
                        typeof p.createdAt === 'number' ? p.createdAt : null,
                    now: Date.now()
                })
                return send(res, 200, { ok: true })
            }
            return send(res, 405, { error: 'method not allowed' })
        }

        // ── outputs list (scope + optional status/type) ──
        if (req.method === 'GET' && route === '/sovereign/outputs') {
            const scope = url.searchParams.get('scope') || ''
            if (!SCOPE_RE.test(scope)) {
                return send(res, 400, { error: 'bad scope' })
            }
            const status = url.searchParams.get('status') || ''
            const type = url.searchParams.get('type') || ''
            const rows = listOutputs(scope, status || null, type || null)
            return send(res, 200, {
                outputs: rows.map((r) => JSON.parse(r.body))
            })
        }

        return send(res, 404, { error: 'no such route' })
    } catch (err) {
        const msg = (err && err.message) || 'error'
        const code = msg === 'body too large' ? 413 : msg.includes('JSON') ? 400 : 500
        return send(res, code, { error: msg })
    }
})

// Loopback only — nginx terminates TLS on the agent subdomain and proxies in.
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[sovereign] listening on 127.0.0.1:${PORT}, db=${DB_PATH}`)
})
