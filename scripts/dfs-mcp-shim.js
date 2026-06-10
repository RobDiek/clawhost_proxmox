#!/usr/bin/env node
/**
 * DFS MCP shim — on-VPS sovereign DataForSEO access (tenant sovereignty D3).
 *
 * A zero-dependency stdio MCP server the openclaw gateway spawns as the
 * "dataforseo" MCP. It exposes a curated set of DataForSEO tools to the agent,
 * but holds NO DFS credentials: every tool call is forwarded to Flowmatic's
 * central relay (controllers/hosting/dfsRelay.ts) over HTTPS, authenticated with
 * the instance's openclaw_token. The relay uses the master DFS account, debits
 * the tenant's prepaid USD balance at exact cost, and never persists the result.
 *
 * So the VPS agent gets live DFS during sovereign (exec_mode='vps') research,
 * while the master key stays central and spend stays metered — the I2/I4 model.
 *
 * Protocol: MCP over stdio = newline-delimited JSON-RPC 2.0 on stdin/stdout.
 * stdout carries ONLY protocol messages; all logging goes to stderr.
 *
 * Env:
 *   DFS_RELAY_URL   full relay endpoint for THIS instance
 *                   (https://<api>/hosting/instances/<id>/dfs/relay)   [required]
 *   OPENCLAW_TOKEN  Bearer token the relay validates (the instance token) [required]
 *   DFS_LOCATION    default DataForSEO location_code (default 2376 = Israel)
 *   DFS_LANGUAGE    default language_code (default 'he')
 */
'use strict'

const RELAY_URL = (process.env.DFS_RELAY_URL || '').trim()
const TOKEN = (process.env.OPENCLAW_TOKEN || '').trim()
const DEF_LOC = parseInt(process.env.DFS_LOCATION || '2376', 10) || 2376
const DEF_LANG = (process.env.DFS_LANGUAGE || 'he').trim()
const SERVER_INFO = { name: 'dataforseo', version: '1.0.0' }

function logErr(...a) { try { process.stderr.write('[dfs-shim] ' + a.join(' ') + '\n') } catch { /* noop */ } }

// ── Tool catalog: map a friendly tool → a relay {path, body} builder ──────────
// Paths must match dfsRelay ALLOWED_DFS_PREFIXES. Each builder returns the DFS
// task array (the relay wraps the call; DFS returns tasks[].result).
const TOOLS = {
    serp_google_organic: {
        description: 'Google organic SERP for a keyword (live, advanced). Returns ranked results incl. AI overviews when present.',
        inputSchema: {
            type: 'object',
            properties: {
                keyword: { type: 'string', description: 'Search query' },
                location_code: { type: 'number', description: `DataForSEO location code (default ${DEF_LOC})` },
                language_code: { type: 'string', description: `Language code (default ${DEF_LANG})` },
                depth: { type: 'number', description: 'How many results (default 20)' },
            },
            required: ['keyword'],
        },
        build: (a) => ({ path: 'serp/google/organic/live/advanced', body: [{ keyword: String(a.keyword), location_code: a.location_code || DEF_LOC, language_code: a.language_code || DEF_LANG, depth: a.depth || 20 }] }),
    },
    keyword_search_volume: {
        description: 'Google Ads monthly search volume / CPC / competition for a list of keywords.',
        inputSchema: {
            type: 'object',
            properties: {
                keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords (max 1000)' },
                location_code: { type: 'number' },
                language_code: { type: 'string' },
            },
            required: ['keywords'],
        },
        build: (a) => ({ path: 'keywords_data/google_ads/search_volume/live', body: [{ keywords: (a.keywords || []).map(String).slice(0, 1000), location_code: a.location_code || DEF_LOC, language_code: a.language_code || DEF_LANG }] }),
    },
    keyword_ideas: {
        description: 'Related keyword ideas (DataForSEO Labs) seeded from keywords, with volume + difficulty.',
        inputSchema: {
            type: 'object',
            properties: {
                keywords: { type: 'array', items: { type: 'string' } },
                location_code: { type: 'number' },
                language_code: { type: 'string' },
                limit: { type: 'number', description: 'Max ideas (default 100)' },
            },
            required: ['keywords'],
        },
        build: (a) => ({ path: 'dataforseo_labs/google/keyword_ideas/live', body: [{ keywords: (a.keywords || []).map(String), location_code: a.location_code || DEF_LOC, language_code: a.language_code || DEF_LANG, limit: a.limit || 100 }] }),
    },
    ranked_keywords: {
        description: 'Keywords a domain currently ranks for in Google (DataForSEO Labs), with positions + volume.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain (no scheme), e.g. example.com' },
                location_code: { type: 'number' },
                language_code: { type: 'string' },
                limit: { type: 'number', description: 'Max keywords (default 100)' },
            },
            required: ['target'],
        },
        build: (a) => ({ path: 'dataforseo_labs/google/ranked_keywords/live', body: [{ target: String(a.target), location_code: a.location_code || DEF_LOC, language_code: a.language_code || DEF_LANG, limit: a.limit || 100 }] }),
    },
    competitors_domain: {
        description: 'Organic competitors for a domain (DataForSEO Labs) — shared keywords + estimated traffic.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain (no scheme)' },
                location_code: { type: 'number' },
                language_code: { type: 'string' },
                limit: { type: 'number', description: 'Max competitors (default 30)' },
            },
            required: ['target'],
        },
        build: (a) => ({ path: 'dataforseo_labs/google/competitors_domain/live', body: [{ target: String(a.target), location_code: a.location_code || DEF_LOC, language_code: a.language_code || DEF_LANG, limit: a.limit || 30 }] }),
    },
    backlinks_summary: {
        description: 'Backlink profile summary for a domain/URL (referring domains, total backlinks, rank).',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string', description: 'Domain or URL' },
            },
            required: ['target'],
        },
        build: (a) => ({ path: 'backlinks/summary/live', body: [{ target: String(a.target) }] }),
    },
}

// ── Relay call ───────────────────────────────────────────────────────────────
async function callRelay(path, body, timeoutMs) {
    const res = await fetch(RELAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ path, body, timeoutMs: timeoutMs || 60000 }),
        signal: AbortSignal.timeout((timeoutMs || 60000) + 15000),
    })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    if (!res.ok) {
        const msg = (json && (json.message || json.error)) || `relay HTTP ${res.status}`
        throw new Error(msg)
    }
    // dfsRelay returns { success, data: { result, cost } }
    const data = json && json.data ? json.data : json
    return data
}

// ── JSON-RPC plumbing ────────────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }
function reply(id, result) { send({ jsonrpc: '2.0', id, result }) }
function replyErr(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }) }

async function handle(msg) {
    const { id, method, params } = msg
    if (method === 'initialize') {
        const pv = (params && params.protocolVersion) || '2024-11-05'
        return reply(id, { protocolVersion: pv, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
    }
    if (method === 'notifications/initialized' || method === 'initialized') return // no response
    if (method === 'ping') return reply(id, {})
    if (method === 'tools/list') {
        const tools = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema }))
        return reply(id, { tools })
    }
    if (method === 'tools/call') {
        const name = params && params.name
        const args = (params && params.arguments) || {}
        const tool = TOOLS[name]
        if (!tool) return reply(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true })
        try {
            const { path, body } = tool.build(args)
            const data = await callRelay(path, body, args.timeoutMs)
            const cost = data && typeof data.cost === 'number' ? data.cost : undefined
            const out = { result: data ? data.result : null, cost_usd: cost }
            return reply(id, { content: [{ type: 'text', text: JSON.stringify(out) }] })
        } catch (e) {
            logErr('tool', name, 'failed:', e.message)
            return reply(id, { content: [{ type: 'text', text: `DataForSEO error: ${e.message}` }], isError: true })
        }
    }
    if (typeof id !== 'undefined') return replyErr(id, -32601, `Method not found: ${method}`)
}

// ── stdin loop (newline-delimited JSON-RPC) ──────────────────────────────────
if (!RELAY_URL || !TOKEN) {
    logErr('FATAL: DFS_RELAY_URL and OPENCLAW_TOKEN are required')
    process.exit(1)
}
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let msg
        try { msg = JSON.parse(line) } catch { logErr('bad json line'); continue }
        Promise.resolve(handle(msg)).catch((e) => logErr('handler error:', e.message))
    }
})
process.stdin.on('end', () => process.exit(0))
logErr(`ready — relay=${RELAY_URL.replace(/\/instances\/[^/]+\//, '/instances/***/')} tools=${Object.keys(TOOLS).length}`)
