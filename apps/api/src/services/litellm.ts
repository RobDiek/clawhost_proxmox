/**
 * LiteLLM Service — Manage the AI gateway on client VPS instances.
 *
 * Each VPS runs a LiteLLM proxy on port 4000.  This service
 * provides helpers to read/update the config (add/remove API
 * keys, enable models, read usage stats) via SSH.
 */

import { Client } from 'ssh2'
import { readFileSync } from 'fs'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); clearTimeout(timer); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { conn.end(); clearTimeout(timer); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH credentials')) }
        conn.connect(opts)
    })
}

// ── Read current LiteLLM config ──
export async function getLitellmConfig(ip: string, password?: string) {
    const raw = await sshExec(ip, 'cat /opt/openclaw/litellm-config.yaml 2>/dev/null || echo "not_found"', password)
    if (raw === 'not_found') return null
    return raw
}

// ── Check if LiteLLM is running ──
export async function getLitellmStatus(ip: string, password?: string) {
    try {
        const status = await sshExec(ip, 'docker ps --filter name=litellm --format "{{.Status}}" 2>/dev/null', password)
        const running = status.toLowerCase().includes('up')

        // Get model list from LiteLLM API
        let models: string[] = []
        if (running) {
            try {
                const modelsRaw = await sshExec(ip, 'curl -sf http://127.0.0.1:4000/v1/models 2>/dev/null | node -e "const d=[];process.stdin.on(\'data\',c=>d.push(c));process.stdin.on(\'end\',()=>{try{const j=JSON.parse(d.join(\'\'));console.log(j.data.map(m=>m.id).join(\',\'))}catch{console.log(\'\')}})"', password)
                models = modelsRaw.split(',').filter(Boolean)
            } catch { /* LiteLLM API not ready yet */ }
        }

        return { running, models }
    } catch {
        return { running: false, models: [] }
    }
}

// ── Update API key in LiteLLM config ──
export async function setLitellmApiKey(
    ip: string,
    provider: 'anthropic' | 'openai',
    apiKey: string,
    password?: string
): Promise<void> {
    // Sanitize key — alphanumeric + dash + underscore only
    const safeKey = apiKey.replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeKey) throw new Error('Invalid API key format')

    const prefix = provider === 'anthropic' ? 'anthropic/' : 'openai/'
    const b64Key = Buffer.from(safeKey).toString('base64')

    // Write the literal key directly into the tenant's litellm-config.yaml (the
    // key BELONGS on the client VPS — sovereignty) for every <provider>/* model,
    // then force-recreate the litellm container so it reloads.
    //
    // The previous approach string-edited docker-compose.litellm.yml's
    // `environment:` block with node, but the indentation never matched the
    // compose layout → the env var was silently NOT injected → litellm ran with
    // no key (and `up -d` saw no change so it wasn't even recreated). This sed
    // targets the inline `{ model: <provider>/…, api_key: <val> }` shape install.sh
    // generates, replacing whatever the current value is (the os.environ
    // placeholder OR an old key) — so re-keying works too. Key is sanitized to
    // [A-Za-z0-9_-] so it is safe inside the sed replacement.
    await sshExec(ip, [
        `KEY=$(echo '${b64Key}' | base64 -d)`,
        `sed -i -E "s#(model: ${prefix}[^,]+, api_key: )[^ }]+#\\1$KEY#g" /opt/openclaw/litellm-config.yaml`,
        `cd /opt/openclaw && docker compose -f docker-compose.yml -f docker-compose.qdrant.yml -f docker-compose.litellm.yml up -d --force-recreate litellm 2>&1 | tail -3`,
    ].join(' && '), password, 90_000)
}

// ── Get usage stats from LiteLLM ──
export async function getLitellmUsage(ip: string, gatewayToken: string, password?: string) {
    try {
        // Validate token is safe for shell interpolation
        const safeToken = (gatewayToken || '').replace(/[^a-zA-Z0-9_-]/g, '')
        if (!safeToken) return []

        const raw = await sshExec(ip, `curl -sf -H "Authorization: Bearer ${safeToken}" http://127.0.0.1:4000/spend/logs?limit=100 2>/dev/null || echo "[]"`, password)
        try {
            return JSON.parse(raw)
        } catch {
            return []
        }
    } catch {
        return []
    }
}

export default {
    getLitellmConfig,
    getLitellmStatus,
    setLitellmApiKey,
    getLitellmUsage,
}