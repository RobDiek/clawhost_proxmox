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

    const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
    const b64Key = Buffer.from(safeKey).toString('base64')

    // Update environment in litellm docker-compose and restart
    await sshExec(ip, [
        `cd /opt/openclaw`,
        // Set env var in litellm compose file
        `grep -q 'environment:' docker-compose.litellm.yml && true || sed -i '/command:/i\\            environment:' docker-compose.litellm.yml`,
        // Add/update the env var using a helper script
        `KEY=$(echo '${b64Key}' | base64 -d)`,
        `cat > /tmp/update-litellm-env.sh << 'UPDEOF'
#!/bin/bash
COMPOSE="/opt/openclaw/docker-compose.litellm.yml"
ENV_VAR="${envVar}"
ENV_VAL="$1"
# Use node to safely update YAML-ish compose
node -e "
const fs = require('fs');
let c = fs.readFileSync('$COMPOSE','utf-8');
if (!c.includes('environment:')) {
  c = c.replace('command:', 'environment:\\n              - ${envVar}=' + process.argv[1] + '\\n            command:');
} else if (c.includes('${envVar}=')) {
  c = c.replace(new RegExp('${envVar}=.*'), '${envVar}=' + process.argv[1]);
} else {
  c = c.replace('environment:', 'environment:\\n              - ${envVar}=' + process.argv[1]);
}
fs.writeFileSync('$COMPOSE', c);
" "$ENV_VAL"
UPDEOF`,
        `chmod +x /tmp/update-litellm-env.sh && /tmp/update-litellm-env.sh "$KEY"`,
        `docker compose -f docker-compose.yml -f docker-compose.qdrant.yml -f docker-compose.litellm.yml up -d litellm`
    ].join(' && '), password, 60_000)
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
