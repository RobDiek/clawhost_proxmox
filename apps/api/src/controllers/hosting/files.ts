import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const VPS_HOME = '/home/openclaw/.openclaw'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { conn.end(); resolve(output) })
            })
        })
        .on('error', reject)

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { /* key not available */ }
        conn.connect(opts)
    })
}

/** Extract userId from JWT Bearer token */
function getUserId(c: Context): string | null {
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    const parts = auth.slice(7).split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const secret = process.env.JWT_SECRET || ''
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload.sub || null
    } catch { return null }
}

/** Get instance with ownership check — returns null if user doesn't own it */
async function getInstance(instanceId: string, userId?: string | null) {
    const conditions = [eq(instances.id, instanceId)]
    if (userId) conditions.push(eq(instances.userId, userId))
    const [instance] = await db.select().from(instances).where(and(...conditions))
    return instance
}

// SSH exec with automatic password from instance
async function sshExecInstance(instance: { ip: string | null; rootPassword?: string | null }, command: string): Promise<string> {
    if (!instance.ip) throw new Error('No IP')
    return sshExec(instance.ip, command, instance.rootPassword || undefined)
}

/** Escape a string for safe use inside single-quoted shell arguments */
function shellEscape(s: string): string {
    // Replace single quotes with '\'' (end quote, escaped quote, start quote)
    return s.replace(/'/g, "'\\''")
}

function sanitizePath(path: string): string | null {
    if (!path) return null
    // Normalize and block traversal (including URL-encoded)
    const decoded = decodeURIComponent(path)
    if (decoded.includes('..') || decoded.startsWith('/') || decoded.includes('\0')) return null
    // Whitelist: only allow safe path characters
    if (!/^[a-zA-Z0-9._\-\/\s\u0590-\u05FF\u0600-\u06FF]+$/.test(decoded)) return null
    return decoded
}

// GET /hosting/instances/:id/files/tree?dir=
export const fileTree = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const dir = c.req.query('dir') || ''
        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const safePath = dir ? sanitizePath(dir) : ''
        if (safePath === null) return fail(c, 'Invalid path.', 400)

        const basePath = safePath ? `${VPS_HOME}/${safePath}` : VPS_HOME
        const output = await sshExecInstance(instance,
            `find '${basePath}' -maxdepth 1 -printf '%y|%s|%T@|%f\\n' 2>/dev/null | tail -n +2 | sort -t'|' -k1,1 -k4,4`
        )

        const items = output.trim().split('\n').filter(Boolean).map(line => {
            const [type, size, mtime, name] = line.split('|')
            return {
                name,
                type: type === 'd' ? 'dir' : 'file',
                size: parseInt(size || '0'),
                modified: new Date(parseFloat(mtime || '0') * 1000).toISOString(),
                path: safePath ? `${safePath}/${name}` : name,
            }
        }).filter(i => i.name && !i.name.startsWith('.'))

        // Sort: dirs first, then files
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
            return a.name.localeCompare(b.name)
        })

        return ok(c, { dir: safePath || '~', items }, 'Directory listed.')
    } catch (err) {
        console.error('fileTree error:', err)
        return fail(c, 'Failed to list directory.', 500)
    }
}

// GET /hosting/instances/:id/files?path=
export const readFile = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const filePath = sanitizePath(c.req.query('path') || '')
        if (!filePath) return fail(c, 'Invalid path.', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        const content = await sshExecInstance(instance, `cat '${fullPath}' 2>/dev/null || echo '__FILE_NOT_FOUND__'`)

        if (content.trim() === '__FILE_NOT_FOUND__') {
            return fail(c, 'File not found.', 404)
        }

        return ok(c, { path: filePath, content }, 'File read.')
    } catch (err) {
        console.error('readFile error:', err)
        return fail(c, 'Failed to read file.', 500)
    }
}

// PUT /hosting/instances/:id/files
export const writeFile = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const { path: rawPath, content } = await c.req.json<{ path: string; content: string }>()
        const filePath = sanitizePath(rawPath)
        if (!filePath) return fail(c, 'Invalid path.', 400)
        if (content && content.length > 5 * 1024 * 1024) return fail(c, 'File too large (max 5MB).', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        // Use base64 encoding to safely transfer content (prevents heredoc/shell injection)
        const b64 = Buffer.from(content, 'utf-8').toString('base64')
        await sshExecInstance(instance, `mkdir -p "$(dirname '${shellEscape(fullPath)}')" && echo '${shellEscape(b64)}' | base64 -d > '${shellEscape(fullPath)}' && chown -R openclaw:openclaw ${VPS_HOME}`)

        return ok(c, { path: filePath }, 'File saved.')
    } catch (err) {
        console.error('writeFile error:', err)
        return fail(c, 'Failed to save file.', 500)
    }
}

// POST /hosting/instances/:id/files/create
export const createFileOrDir = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const { path: rawPath, type } = await c.req.json<{ path: string; type: 'file' | 'dir' }>()
        const filePath = sanitizePath(rawPath)
        if (!filePath) return fail(c, 'Invalid path.', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        if (type === 'dir') {
            await sshExecInstance(instance, `mkdir -p '${fullPath}' && chown -R openclaw:openclaw ${VPS_HOME}`)
        } else {
            await sshExecInstance(instance, `mkdir -p "$(dirname '${fullPath}')" && touch '${fullPath}' && chown -R openclaw:openclaw ${VPS_HOME}`)
        }

        return ok(c, { path: filePath, type }, 'Created.')
    } catch (err) {
        console.error('createFileOrDir error:', err)
        return fail(c, 'Failed to create.', 500)
    }
}

// DELETE /hosting/instances/:id/files?path=
export const deleteFile = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const filePath = sanitizePath(c.req.query('path') || '')
        if (!filePath) return fail(c, 'Invalid path.', 400)

        // Safety: don't allow deleting critical files
        const protected_paths = ['.openclaw/openclaw.json']
        if (protected_paths.some(p => filePath.endsWith(p))) {
            return fail(c, 'Cannot delete protected file.', 403)
        }

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        await sshExecInstance(instance, `rm -rf '${fullPath}'`)

        return ok(c, { path: filePath }, 'Deleted.')
    } catch (err) {
        console.error('deleteFile error:', err)
        return fail(c, 'Failed to delete.', 500)
    }
}

// POST /hosting/instances/:id/files/rename
export const renameFile = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const { from, to } = await c.req.json<{ from: string; to: string }>()
        const fromPath = sanitizePath(from)
        const toPath = sanitizePath(to)
        if (!fromPath || !toPath) return fail(c, 'Invalid paths.', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        await sshExecInstance(instance, `mv '${shellEscape(`${VPS_HOME}/${fromPath}`)}' '${shellEscape(`${VPS_HOME}/${toPath}`)}' && chown -R openclaw:openclaw ${VPS_HOME}`)

        return ok(c, { from: fromPath, to: toPath }, 'Renamed.')
    } catch (err) {
        console.error('renameFile error:', err)
        return fail(c, 'Failed to rename.', 500)
    }
}

// GET /hosting/instances/:id/stats
export const serverStats = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const output = await sshExecInstance(instance, `
            echo "CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' 2>/dev/null || echo '0')"
            echo "RAM_USED:$(free -m | awk 'NR==2{print $3}' 2>/dev/null || echo '0')"
            echo "RAM_TOTAL:$(free -m | awk 'NR==2{print $2}' 2>/dev/null || echo '0')"
            echo "DISK_USED:$(df -m / | awk 'NR==2{print $3}' 2>/dev/null || echo '0')"
            echo "DISK_TOTAL:$(df -m / | awk 'NR==2{print $2}' 2>/dev/null || echo '0')"
            echo "UPTIME:$(uptime -s 2>/dev/null || echo 'unknown')"
            echo "DOCKER:$(docker ps --format '{{.Names}}:{{.Status}}' 2>/dev/null | tr '\\n' ',')"
            echo "OPENCLAW:$(systemctl is-active openclaw-gateway 2>/dev/null || echo 'unknown')"
        `)

        const stats: Record<string, string> = {}
        output.split('\n').forEach(line => {
            const [key, ...val] = line.split(':')
            if (key) stats[key.trim()] = val.join(':').trim()
        })

        return ok(c, {
            cpu: parseFloat(stats.CPU || '0'),
            ramUsed: parseInt(stats.RAM_USED || '0'),
            ramTotal: parseInt(stats.RAM_TOTAL || '0'),
            diskUsed: parseInt(stats.DISK_USED || '0'),
            diskTotal: parseInt(stats.DISK_TOTAL || '0'),
            uptime: stats.UPTIME || 'unknown',
            docker: stats.DOCKER || '',
            openclaw: stats.OPENCLAW || 'unknown',
        }, 'Stats retrieved.')
    } catch (err) {
        console.error('serverStats error:', err)
        return fail(c, 'Failed to get stats.', 500)
    }
}

// GET /hosting/instances/:id/logs?lines=100&service=openclaw
export const serverLogs = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const lines = parseInt(c.req.query('lines') || '50')
        const service = c.req.query('service') || 'openclaw-gateway'

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const allowedServices = ['openclaw-gateway', 'nginx', 'docker']
        if (!allowedServices.includes(service)) return fail(c, 'Invalid service.', 400)

        const output = await sshExecInstance(instance, `journalctl -u ${service} --no-pager -n ${Math.min(lines, 500)} 2>/dev/null || echo 'No logs available'`)

        return ok(c, { service, lines: output.split('\n') }, 'Logs retrieved.')
    } catch (err) {
        console.error('serverLogs error:', err)
        return fail(c, 'Failed to get logs.', 500)
    }
}

// Existing exports
export const listFiles = async (c: Context) => {
    return fileTree(c)
}

export const deployCustomAgent = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const { name, soul, model } = await c.req.json<{ name: string; soul: string; model: string }>()
        if (!name || !soul) return fail(c, 'Name and soul are required.', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
        if (!slug || slug.length > 50) return fail(c, 'Invalid agent name.', 400)
        const agentPath = `${VPS_HOME}/.openclaw/agents/${slug}`

        // Use base64 to safely transfer soul content
        const soulB64 = Buffer.from(soul, 'utf-8').toString('base64')
        await sshExecInstance(instance, `
            mkdir -p '${shellEscape(agentPath)}/output' &&
            echo '${shellEscape(soulB64)}' | base64 -d > '${shellEscape(agentPath)}/SOUL.md' &&
            chown -R openclaw:openclaw ${VPS_HOME} &&
            systemctl restart openclaw-gateway
        `)

        return ok(c, { slug, path: `agents/${slug}/SOUL.md` }, 'Agent deployed.')
    } catch (err) {
        console.error('deployCustomAgent error:', err)
        return fail(c, 'Failed to deploy agent.', 500)
    }
}

export const saveIntegration = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const { type, key } = await c.req.json<{ type: string; key: string }>()
        if (!type || !key) return fail(c, 'Type and key are required.', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        // Validate key: reject shell metacharacters for API keys
        const safeKey = shellEscape(key)
        const SVC = '/etc/systemd/system/openclaw-gateway.service'

        // Helper: safely set env var in systemd service file using base64
        const setEnvVar = (envName: string) =>
            `KEY=$(echo '${Buffer.from(key).toString('base64')}' | base64 -d) && ` +
            `grep -q ${envName} ${SVC} && sed -i "s|Environment=${envName}=.*|Environment=${envName}=$KEY|" ${SVC} || ` +
            `sed -i "/Environment=NODE_ENV=production/a\\Environment=${envName}=$KEY" ${SVC} && systemctl daemon-reload`

        // Helper: safely write JSON config file using base64
        const writeConfig = (dir: string, file: string, json: object) => {
            const b64 = Buffer.from(JSON.stringify(json)).toString('base64')
            return `mkdir -p ${dir} && echo '${b64}' | base64 -d > ${dir}/${file}`
        }

        const commands: Record<string, string> = {
            anthropic: setEnvVar('ANTHROPIC_API_KEY'),
            openai: setEnvVar('OPENAI_API_KEY'),
            gemini: setEnvVar('GOOGLE_API_KEY'),
            groq: setEnvVar('GROQ_API_KEY'),
            cerebras: setEnvVar('CEREBRAS_API_KEY'),
            telegram: `su - openclaw -c 'openclaw channels add --channel telegram --token "'\\''${safeKey}'\\'' --name "telegram-main" 2>/dev/null'`,
            brave: writeConfig(`${VPS_HOME}/skills-config`, 'brave-search.json', { braveApiKey: key }),
            brightdata: writeConfig(`${VPS_HOME}/skills-config`, 'bright-data.json', { apiKey: key }),
            replicate: writeConfig(`${VPS_HOME}/skills-config`, 'replicate.json', { apiToken: key }),
            ollama: `systemctl start ollama 2>/dev/null; ollama pull '${safeKey}' 2>/dev/null & cd /home/openclaw && openclaw provider add ollama --model '${safeKey}' 2>/dev/null || (mkdir -p ${VPS_HOME}/providers && echo '${Buffer.from(JSON.stringify({ provider: 'ollama', model: key })).toString('base64')}' | base64 -d > ${VPS_HOME}/providers/ollama.json)`,
            resend: writeConfig(`${VPS_HOME}/skills-config`, 'resend.json', { apiKey: key }),
            smtp: (() => { try { return writeConfig(`${VPS_HOME}/skills-config`, 'smtp.json', JSON.parse(key)); } catch { return writeConfig(`${VPS_HOME}/skills-config`, 'smtp.json', { data: key }); } })(),
            wordpress: (() => { try { const p = JSON.parse(key); return writeConfig(`${VPS_HOME}/skills-config`, 'wordpress.json', p.constructor === Object ? p : { data: key }); } catch { return writeConfig(`${VPS_HOME}/skills-config`, 'wordpress.json', { data: key }); } })(),
            'newsletter-recipients': (() => { try { const p = JSON.parse(key); return writeConfig(`${VPS_HOME}/skills-config`, 'newsletter-recipients.json', p.constructor === Object ? p : { data: key }); } catch { return writeConfig(`${VPS_HOME}/skills-config`, 'newsletter-recipients.json', { data: key }); } })(),
        }

        const cmd = commands[type]
        if (!cmd) return fail(c, 'Unknown integration type.', 400)

        // For Telegram, ensure device is paired first (required for CLI channels add)
        if (type === 'telegram') {
            const pairTest = await sshExecInstance(instance, `su - openclaw -c 'openclaw cron list 2>&1' 2>&1`)
            if (pairTest.includes('pairing required') || pairTest.includes('abnormal closure')) {
                console.log(`Device not paired on ${instance.ip}, pairing...`)
                await sshExecInstance(instance, `su - openclaw -c 'openclaw config set gateway.port 3000 2>/dev/null; openclaw cron list 2>/dev/null || true' 2>&1`)
                await new Promise(r => setTimeout(r, 2000))
                await sshExecInstance(instance, `
                    su - openclaw -c '
                    DEVICE_ID=$(node -e "try{const d=require(process.env.HOME+\\\"/.openclaw/identity/device.json\\\");console.log(d.deviceId)}catch(e){}" 2>/dev/null)
                    PUB_KEY=$(node -e "try{const p=require(process.env.HOME+\\\"/.openclaw/devices/pending.json\\\");const k=Object.values(p)[0];if(k)console.log(k.publicKey)}catch(e){}" 2>/dev/null)
                    if [ -n "$DEVICE_ID" ] && [ -n "$PUB_KEY" ]; then
                        mkdir -p ~/.openclaw/devices
                        printf "{\\n  \\"$DEVICE_ID\\": {\\n    \\"deviceId\\": \\"$DEVICE_ID\\",\\n    \\"publicKey\\": \\"$PUB_KEY\\",\\n    \\"platform\\": \\"linux\\",\\n    \\"clientId\\": \\"cli\\",\\n    \\"clientMode\\": \\"cli\\",\\n    \\"role\\": \\"operator\\",\\n    \\"roles\\": [\\"operator\\"],\\n    \\"scopes\\": [\\"operator.admin\\",\\"operator.read\\",\\"operator.write\\",\\"operator.approvals\\",\\"operator.pairing\\"],\\n    \\"pairedAtMs\\": '$(date +%%s000)',\\n    \\"label\\": \\"local-cli\\"\\n  }\\n}" > ~/.openclaw/devices/paired.json
                        echo "{}" > ~/.openclaw/devices/pending.json
                    fi
                    '
                `)
                await sshExecInstance(instance, 'systemctl restart openclaw-gateway')
                await new Promise(r => setTimeout(r, 4000))
            }
        }

        await sshExecInstance(instance, `${cmd} && chown -R openclaw:openclaw /home/openclaw/.openclaw && systemctl restart openclaw-gateway`)

        // Configure OpenClaw primary model when AI provider key is saved
        if (type === 'groq' || type === 'anthropic' || type === 'openai' || type === 'cerebras') {
            const CONFIG = '/home/openclaw/.openclaw/openclaw.json'
            const modelConfigs: Record<string, { primary: string; fallbacks: string[]; models: Record<string, { alias: string }> }> = {
                groq: {
                    primary: 'groq/openai/gpt-oss-120b',
                    fallbacks: ['groq/openai/gpt-oss-20b'],
                    models: {
                        'groq/openai/gpt-oss-120b': { alias: 'gpt-oss' },
                        'groq/openai/gpt-oss-20b': { alias: 'gpt-oss-fast' },
                        'groq/meta-llama/llama-4-scout-17b-16e-instruct': { alias: 'scout' },
                        'groq/qwen/qwen3-32b': { alias: 'qwen' },
                    },
                },
                anthropic: {
                    primary: 'anthropic/claude-sonnet-4-6',
                    fallbacks: ['anthropic/claude-haiku-4-5-20251001'],
                    models: {
                        'anthropic/claude-opus-4-6': { alias: 'opus' },
                        'anthropic/claude-sonnet-4-6': { alias: 'sonnet' },
                        'anthropic/claude-haiku-4-5-20251001': { alias: 'haiku' },
                    },
                },
                openai: {
                    primary: 'openai/gpt-4o',
                    fallbacks: ['openai/gpt-4o-mini'],
                    models: {
                        'openai/gpt-4o': { alias: 'gpt4o' },
                        'openai/gpt-4o-mini': { alias: 'gpt4o-mini' },
                    },
                },
                cerebras: {
                    primary: 'cerebras/gpt-oss-120b',
                    fallbacks: ['cerebras/llama3.1-8b'],
                    models: {
                        'cerebras/gpt-oss-120b': { alias: 'gpt-oss' },
                        'cerebras/llama3.1-8b': { alias: 'llama-fast' },
                        'cerebras/qwen-3-235b-a22b-instruct-2507': { alias: 'qwen' },
                    },
                },
            }
            const cfg = modelConfigs[type]
            if (cfg) {
                const configScript = Buffer.from(JSON.stringify(cfg)).toString('base64')
                try {
                    await sshExecInstance(instance, `
                        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode('${configScript}'))
with open('${CONFIG}') as f: d = json.load(f)
defaults = d.setdefault('agents', {}).setdefault('defaults', {})
model = defaults.setdefault('model', {})
# Only set primary if no other provider is already primary, or if same provider
current = model.get('primary', '')
if not current or current.startswith('ollama/') or current.startswith('${type}/'):
    model['primary'] = cfg['primary']
    model['fallbacks'] = cfg['fallbacks']
# Always merge models (don't overwrite other providers)
existing = defaults.setdefault('models', {})
for k, v in cfg['models'].items():
    existing[k] = v
with open('${CONFIG}', 'w') as f: json.dump(d, f, indent=2)
print('OK: primary=' + model['primary'])
"
                        chown openclaw:openclaw ${CONFIG}
                        systemctl restart openclaw-gateway
                    `)
                    console.log(`OpenClaw config updated: ${type} provider set as primary`)
                } catch (err) {
                    console.error(`Failed to update OpenClaw config for ${type}:`, err)
                }
            }
        }

        // Deploy MCP server for integrations that have one
        const mcpDeployments: Record<string, () => object | null> = {
            brave: () => ({
                command: 'npx',
                args: ['-y', '@brave/brave-search-mcp-server'],
                env: { BRAVE_API_KEY: key },
            }),
            wordpress: () => {
                try {
                    const wp = JSON.parse(key)
                    return {
                        command: 'npx',
                        args: ['-y', '@respira/wordpress-mcp-server'],
                        env: { WP_URL: wp.url || '', WP_USERNAME: wp.username || '', WP_APP_PASSWORD: wp.password || wp.appPassword || '' },
                    }
                } catch { return null }
            },
            smtp: () => {
                try {
                    const smtp = JSON.parse(key)
                    return {
                        command: 'npx',
                        args: ['-y', 'mcp-mail-server'],
                        env: { SMTP_HOST: smtp.host || '', SMTP_PORT: String(smtp.port || 587), SMTP_USER: smtp.user || smtp.username || '', SMTP_PASS: smtp.pass || smtp.password || '' },
                    }
                } catch { return null }
            },
            replicate: () => ({
                command: 'npx',
                args: ['-y', '@gongrzhe/image-gen-server'],
                env: { REPLICATE_API_TOKEN: key },
            }),
        }

        const mcpServerId: Record<string, string> = { brave: 'brave-search', wordpress: 'wordpress', smtp: 'email', replicate: 'replicate' }
        if (mcpDeployments[type]) {
            try {
                const mcpConfig = mcpDeployments[type]()
                if (mcpConfig) {
                    const b64Mcp = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')
                    await sshExecInstance(instance, `
                        mkdir -p /home/openclaw/.openclaw/mcp-servers && echo '${b64Mcp}' | base64 -d > /home/openclaw/.openclaw/mcp-servers/${mcpServerId[type]}.json && chown -R openclaw:openclaw /home/openclaw/.openclaw/mcp-servers
                    `)
                    await sshExecInstance(instance, 'systemctl restart openclaw-gateway')
                }
            } catch (mcpErr) {
                console.error(`MCP deploy for ${type} failed:`, mcpErr)
                // Non-critical — legacy config file was already written
            }
        }

        // Update onboarding progress + save API key in DB
        if (['anthropic', 'openai', 'gemini'].includes(type)) {
            const updateData: Record<string, unknown> = {}
            if (type === 'anthropic') {
                updateData.aiProviderKey = key
                updateData.aiProviderType = 'anthropic'
            } else if (type === 'openai') {
                updateData.openaiApiKey = key
            }
            const step = instance.onboardingStep ?? 0
            if (step < 2) updateData.onboardingStep = 2
            await db.update(instances).set(updateData).where(eq(instances.id, instanceId))
        }
        if (type === 'telegram') {
            await db.update(instances).set({
                onboardingStep: 3,
                onboardingCompleted: true,
                telegramBotToken: key
            }).where(eq(instances.id, instanceId))
        }

        // Save sub-agent model configuration — single source of truth
        if (type === 'sub-agent-models') {
            try {
                const models = JSON.parse(key) as Record<string, string>
                // Save to DB
                await db.update(instances).set({
                    subAgentModels: models as any,
                }).where(eq(instances.id, instanceId))

                // Re-register OpenClaw agents on VPS with new models
                const agentsToUpdate = ['sayer', 'menateach', 'et', 'meater', 'maazin', 'yotzer', 'shaliach', 'migdalor']
                for (const agentName of agentsToUpdate) {
                    const model = models[agentName]
                    if (!model) continue
                    // Validate agent name (alphanumeric only) and model (provider/model format)
                    if (!/^[a-z]+$/.test(agentName)) continue
                    if (!/^[a-zA-Z0-9\/_.-]+$/.test(model)) continue
                    await sshExecInstance(instance, `
                        su - openclaw -c '
                        openclaw agents delete ${agentName} --force 2>/dev/null;
                        openclaw agents add ${agentName} --model '\\''${shellEscape(model)}'\\'' --workspace ~/.openclaw/workspace --agent-dir ~/.openclaw/agents/${agentName} --non-interactive 2>/dev/null
                        '
                    `)
                }
                // Restart gateway to pick up changes
                await sshExecInstance(instance, 'systemctl restart openclaw-gateway')
            } catch (e) {
                console.error('sub-agent-models update error:', e)
            }
        }

        // Sync channel status to VPS after any integration change
        try {
            const { syncChannelsToVPS } = await import('@/services/channelSync')
            syncChannelsToVPS(instanceId).catch(() => {})
        } catch {}

        return ok(c, { type }, 'Integration saved.')
    } catch (err) {
        console.error('saveIntegration error:', err)
        return fail(c, 'Failed to save integration.', 500)
    }
}

// POST /hosting/instances/:id/integrations/test-smtp
export const testSmtp = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const { to } = await c.req.json<{ to: string }>()
        if (!to) return fail(c, 'Recipient email required.', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        // Read SMTP config from VPS and send test email via Python
        const result = await sshExecInstance(instance, `
            python3 -c "
import json, smtplib
from email.mime.text import MIMEText

with open('/home/openclaw/.openclaw/skills-config/smtp.json') as f:
    cfg = json.load(f)

msg = MIMEText('This is a test email from ClawFlow SMTP integration.\\n\\nIf you see this, SMTP is configured correctly!', 'plain', 'utf-8')
msg['Subject'] = 'ClawFlow SMTP Test'
msg['From'] = cfg.get('from', 'ClawFlow') + ' <' + cfg['user'] + '>'
msg['To'] = '${to.replace(/'/g, '')}'

use_ssl = cfg.get('secure') == 'ssl'
port = cfg.get('port', 587)

if use_ssl:
    server = smtplib.SMTP_SSL(cfg['host'], port, timeout=10)
else:
    server = smtplib.SMTP(cfg['host'], port, timeout=10)
    server.starttls()

server.login(cfg['user'], cfg['pass'])
server.send_message(msg)
server.quit()
print('OK')
" 2>&1
        `)

        if (result.includes('OK')) {
            return ok(c, null, 'Test email sent successfully.')
        } else {
            return fail(c, 'SMTP test failed: ' + result.slice(0, 200), 400)
        }
    } catch (err) {
        console.error('testSmtp error:', err)
        return fail(c, 'Failed to test SMTP.', 500)
    }
}
