import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq, and } from 'drizzle-orm'
import crypto from 'crypto'
import { db } from '@/db'
import { instances, matehAgents } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveActiveAgent, agentVpsPaths } from '@/services/agentContext'
import { setAgentIntegration, getPrimaryAgent } from '@/services/agentIntegrations'
import { roleModel } from '@openclaw/shared'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const VPS_HOME = '/home/openclaw/.openclaw'

// agentVpsPaths (primary vs secondary openclaw home / config / gateway unit) is
// the canonical per-agent path helper — now shared from services/agentContext so
// setup.ts / firecrawl.ts / dataforseo.ts use the exact same resolution.

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
    if (!/^[a-zA-Z0-9._\-/\s\u0590-\u05FF\u0600-\u06FF]+$/.test(decoded)) return null
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

// GET /hosting/instances/:id/disk/breakdown
// Phase 4.0(disk) — diagnostic: where is the disk space going?
// Returns top consumers in the customer VPS (docker, journal, /home,
// /var, etc) so the dashboard "what ate it?" drawer can show real
// numbers instead of forcing the user to SSH.
export const diskBreakdown = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const output = await sshExecInstance(instance, `
            df -m / | awk 'NR==2{printf "DISK_USED:%s\\nDISK_TOTAL:%s\\n", $3, $2}'
            echo "DIRS:"
            du -sm /var/lib/docker 2>/dev/null | awk '{print "docker:"$1}'
            du -sm /var/log 2>/dev/null | awk '{print "logs:"$1}'
            du -sm /home/openclaw 2>/dev/null | awk '{print "openclaw:"$1}'
            du -sm /opt 2>/dev/null | awk '{print "opt:"$1}'
            du -sm /tmp 2>/dev/null | awk '{print "tmp:"$1}'
            du -sm /root 2>/dev/null | awk '{print "root:"$1}'
            echo "DOCKER_DETAIL:"
            docker system df --format '{{.Type}}:{{.Size}}:{{.Reclaimable}}' 2>/dev/null || echo "n/a"
        `)

        const result: {
            diskUsedMb: number; diskTotalMb: number; usagePct: number;
            topDirs: Array<{ name: string; sizeMb: number }>;
            dockerDetail: Array<{ type: string; size: string; reclaimable: string }>;
        } = { diskUsedMb: 0, diskTotalMb: 0, usagePct: 0, topDirs: [], dockerDetail: [] }
        const lines = output.split('\n')
        let section: 'top' | 'dirs' | 'docker' = 'top'
        for (const raw of lines) {
            const line = raw.trim()
            if (line === 'DIRS:') { section = 'dirs'; continue }
            if (line === 'DOCKER_DETAIL:') { section = 'docker'; continue }
            if (section === 'top') {
                if (line.startsWith('DISK_USED:')) result.diskUsedMb = parseInt(line.substring('DISK_USED:'.length)) || 0
                if (line.startsWith('DISK_TOTAL:')) result.diskTotalMb = parseInt(line.substring('DISK_TOTAL:'.length)) || 0
            } else if (section === 'dirs') {
                const m = line.match(/^([a-z_]+):(\d+)/)
                if (m) result.topDirs.push({ name: m[1], sizeMb: parseInt(m[2]) || 0 })
            } else if (section === 'docker') {
                const parts = line.split(':')
                if (parts.length >= 3) result.dockerDetail.push({ type: parts[0], size: parts[1], reclaimable: parts.slice(2).join(':') })
            }
        }
        result.usagePct = result.diskTotalMb > 0 ? Math.round((result.diskUsedMb / result.diskTotalMb) * 100) : 0
        result.topDirs.sort((a, b) => b.sizeMb - a.sizeMb)

        return ok(c, result, 'Disk breakdown retrieved.')
    } catch (err) {
        console.error('diskBreakdown error:', err)
        return fail(c, 'Failed to read disk breakdown.', 500)
    }
}

// POST /hosting/instances/:id/disk/cleanup
// Phase 4.0(disk) — one-click cleanup: vacuum journals, prune docker
// build cache + unused images. Conservative — never touches user files
// or running containers' data volumes. Returns how much was freed.
export const diskCleanup = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const output = await sshExecInstance(instance, `
            BEFORE=$(df -m / | awk 'NR==2{print $4}')
            echo "BEFORE_FREE_MB:$BEFORE"
            # Journal vacuum — drop archived journals older than 1 day
            journalctl --vacuum-time=1d 2>&1 | tail -1
            # Docker prune — build cache (-af = no confirm + all)
            docker builder prune -af 2>&1 | tail -1
            # Docker unused images
            docker image prune -af 2>&1 | tail -1
            # APT cache
            apt-get clean 2>&1 || true
            AFTER=$(df -m / | awk 'NR==2{print $4}')
            echo "AFTER_FREE_MB:$AFTER"
        `)

        const before = parseInt((output.match(/BEFORE_FREE_MB:(\d+)/) || [])[1] || '0', 10)
        const after = parseInt((output.match(/AFTER_FREE_MB:(\d+)/) || [])[1] || '0', 10)
        const freedMb = Math.max(0, after - before)
        return ok(c, { beforeFreeMb: before, afterFreeMb: after, freedMb }, 'Cleanup complete.')
    } catch (err) {
        console.error('diskCleanup error:', err)
        return fail(c, 'Failed to clean disk.', 500)
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

// Optimal default models per provider, tuned per agent role
function getDefaultModelsForProvider(provider: string): Record<string, string> {
    const AGENTS = ['mateh', 'sayer', 'meater', 'maazin', 'menateach', 'et', 'yotzer', 'shaliach', 'migdalor']
    // Per-agent role priorities: coordinator, researcher, researcher, listener, analyst, writer, creative, distributor, auditor
    // Anthropic defaults are DERIVED from the @openclaw/shared registry (ROLE_TIERS ×
    // current model IDs) — never hardcode model strings here or they drift. Bump the
    // registry (or apply a tier override) and connect-time assignment follows.
    const providerDefaults: Record<string, Record<string, string>> = {
        anthropic: Object.fromEntries(AGENTS.map(role => [role, roleModel(role)])),
        openai: {
            mateh: 'openai/gpt-4o-mini', sayer: 'openai/gpt-4o', meater: 'openai/gpt-4o',
            maazin: 'openai/gpt-4o-mini', menateach: 'openai/gpt-4o', et: 'openai/gpt-4o',
            yotzer: 'openai/gpt-4o', shaliach: 'openai/gpt-4o-mini', migdalor: 'openai/gpt-4o',
        },
        groq: {
            mateh: 'groq/openai/gpt-oss-20b', sayer: 'groq/openai/gpt-oss-120b', meater: 'groq/openai/gpt-oss-120b',
            maazin: 'groq/openai/gpt-oss-20b', menateach: 'groq/openai/gpt-oss-120b', et: 'groq/qwen/qwen3-32b',
            yotzer: 'groq/qwen/qwen3-32b', shaliach: 'groq/openai/gpt-oss-20b', migdalor: 'groq/openai/gpt-oss-120b',
        },
        cerebras: {
            mateh: 'cerebras/llama3.1-8b', sayer: 'cerebras/gpt-oss-120b', meater: 'cerebras/gpt-oss-120b',
            maazin: 'cerebras/llama3.1-8b', menateach: 'cerebras/gpt-oss-120b', et: 'cerebras/qwen-3-235b-a22b-instruct-2507',
            yotzer: 'cerebras/qwen-3-235b-a22b-instruct-2507', shaliach: 'cerebras/llama3.1-8b', migdalor: 'cerebras/gpt-oss-120b',
        },
    }
    return providerDefaults[provider] || providerDefaults.anthropic
}

export const saveIntegration = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const { type, key } = await c.req.json<{ type: string; key: string }>()
        if (!type || !key) return fail(c, 'Type and key are required.', 400)

        const instance = await getInstance(instanceId, userId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        // Phase 2.3.B — agent-aware paths. For the primary agent these resolve
        // to the legacy openclaw-gateway / .openclaw layout (unchanged); for
        // secondary agents they resolve to the per-agent dir + per-agent
        // systemd unit so the right gateway sees the new env var / config.
        const __agent = await resolveActiveAgent(c, instanceId)
        const __paths = agentVpsPaths(__agent)

        // Validate key: reject shell metacharacters for API keys
        const safeKey = shellEscape(key)
        const SVC = `/etc/systemd/system/${__paths.systemdUnit}.service`

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

        // Per-agent home for skills-config / providers (so secondary agents
        // don't pollute the primary's config). Falls back to VPS_HOME for
        // primary so existing files remain in place.
        const VPS_HOME_FOR_AGENT = __paths.home

        const commands: Record<string, string> = {
            anthropic: setEnvVar('ANTHROPIC_API_KEY'),
            openai: setEnvVar('OPENAI_API_KEY'),
            gemini: setEnvVar('GOOGLE_API_KEY'),
            groq: setEnvVar('GROQ_API_KEY'),
            cerebras: setEnvVar('CEREBRAS_API_KEY'),
            telegram: `su - openclaw -c 'HOME=${__paths.baseHome} openclaw channels add --channel telegram --token "'\\''${safeKey}'\\'' --name "telegram-main" 2>/dev/null'`,
            brave: `echo 'MCP deploy handles brave-search'`,
            brightdata: writeConfig(`${VPS_HOME_FOR_AGENT}/skills-config`, 'bright-data.json', { apiKey: key }),
            replicate: `echo 'MCP deploy handles replicate'`,
            ollama: `systemctl start ollama 2>/dev/null; ollama pull '${safeKey}' 2>/dev/null & cd /home/openclaw && openclaw provider add ollama --model '${safeKey}' 2>/dev/null || (mkdir -p ${VPS_HOME_FOR_AGENT}/providers && echo '${Buffer.from(JSON.stringify({ provider: 'ollama', model: key })).toString('base64')}' | base64 -d > ${VPS_HOME_FOR_AGENT}/providers/ollama.json)`,
            resend: writeConfig(`${VPS_HOME_FOR_AGENT}/skills-config`, 'resend.json', { apiKey: key }),
            smtp: `echo 'MCP deploy handles email'`,
            wordpress: `echo 'MCP deploy handles wordpress'`,
            'newsletter-recipients': (() => { try { const p = JSON.parse(key); return writeConfig(`${VPS_HOME_FOR_AGENT}/skills-config`, 'newsletter-recipients.json', p.constructor === Object ? p : { data: key }); } catch { return writeConfig(`${VPS_HOME_FOR_AGENT}/skills-config`, 'newsletter-recipients.json', { data: key }); } })(),
            'sub-agent-models': `echo 'handled below'`,
            'model-prefs': `echo 'handled below'`,
            'tool-profile': `echo 'handled below'`,
        }

        const cmd = commands[type]
        if (!cmd) return fail(c, 'Unknown integration type.', 400)

        // For Telegram, ensure device is paired first (required for CLI channels add).
        // Phase 2.3.B — pairing only meaningful for primary agent (CLI channels).
        // Secondaries don't have their own pairing flow yet — skip the pre-pair test.
        if (type === 'telegram' && (!__agent || __agent.isPrimary)) {
            const pairTest = await sshExecInstance(instance, `su - openclaw -c 'openclaw cron list 2>&1' 2>&1`)
            if (pairTest.includes('pairing required') || pairTest.includes('abnormal closure')) {
                console.log(`Device not paired on ${instance.ip}, pairing...`)
                await sshExecInstance(instance, `su - openclaw -c 'openclaw config set gateway.port 3000 2>/dev/null; openclaw cron list 2>/dev/null || true' 2>&1`)
                await new Promise(r => setTimeout(r, 2000))
                await sshExecInstance(instance, `
                    su - openclaw -c '
                    DEVICE_ID=$(node -e "try{const d=require(process.env.HOME+\\"/.openclaw/identity/device.json\\");console.log(d.deviceId)}catch(e){}" 2>/dev/null)
                    PUB_KEY=$(node -e "try{const p=require(process.env.HOME+\\"/.openclaw/devices/pending.json\\");const k=Object.values(p)[0];if(k)console.log(k.publicKey)}catch(e){}" 2>/dev/null)
                    if [ -n "$DEVICE_ID" ] && [ -n "$PUB_KEY" ]; then
                        mkdir -p ~/.openclaw/devices
                        printf "{\\n  \\"$DEVICE_ID\\": {\\n    \\"deviceId\\": \\"$DEVICE_ID\\",\\n    \\"publicKey\\": \\"$PUB_KEY\\",\\n    \\"platform\\": \\"linux\\",\\n    \\"clientId\\": \\"cli\\",\\n    \\"clientMode\\": \\"cli\\",\\n    \\"role\\": \\"operator\\",\\n    \\"roles\\": [\\"operator\\"],\\n    \\"scopes\\": [\\"operator.admin\\",\\"operator.read\\",\\"operator.write\\",\\"operator.approvals\\",\\"operator.pairing\\"],\\n    \\"pairedAtMs\\": '$(date +%%s000)',\\n    \\"label\\": \\"local-cli\\"\\n  }\\n}" > ~/.openclaw/devices/paired.json
                        echo "{}" > ~/.openclaw/devices/pending.json
                    fi
                    '
                `)
                await sshExecInstance(instance, `systemctl restart ${__paths.systemdUnit}`)
                await new Promise(r => setTimeout(r, 4000))
            }
        }

        await sshExecInstance(instance, `${cmd} && chown -R openclaw:openclaw ${__paths.home} 2>/dev/null; systemctl restart ${__paths.systemdUnit}`)

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
                        'anthropic/claude-opus-4-8': { alias: 'opus' },
                        'anthropic/claude-sonnet-4-6': { alias: 'sonnet' },
                        'anthropic/claude-haiku-4-5-20251001': { alias: 'haiku' },
                    },
                },
                openai: {
                    primary: 'openai/gpt-4o-mini',
                    fallbacks: ['openai/gpt-4o'],
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
                try {
                    // CRITICAL: stop gateway → edit config → start gateway
                    // Gateway overwrites openclaw.json from internal state on hot-reload
                    const cfgB64 = Buffer.from(JSON.stringify(cfg)).toString('base64')
                    await sshExecInstance(instance, `
                        systemctl stop ${__paths.systemdUnit} &&
                        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '${__paths.configFile}'
with open(p) as f: d = json.load(f)
defaults = d.setdefault('agents', {}).setdefault('defaults', {})
model = defaults.setdefault('model', {})
model['primary'] = cfg['primary']
model['fallbacks'] = cfg['fallbacks']
existing = defaults.setdefault('models', {})
for k, v in cfg['models'].items():
    existing[k] = v
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('OK: primary=' + model['primary'])
" '${cfgB64}' &&
                        chown openclaw:openclaw ${__paths.configFile} &&
                        systemctl start ${__paths.systemdUnit}
                    `)
                    console.log(`OpenClaw config updated: ${type} provider set as primary (agent=${__agent?.id || 'primary'})`)
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
                    const serverId = mcpServerId[type] || type
                    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')
                    // CRITICAL: stop → edit → start (gateway overwrites on hot-reload)
                    await sshExecInstance(instance, `
                        systemctl stop ${__paths.systemdUnit} &&
                        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '${__paths.configFile}'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
d['mcp']['servers']['${serverId}'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('${serverId} configured')
" '${mcpB64}' &&
                        chown openclaw:openclaw ${__paths.configFile} &&
                        systemctl start ${__paths.systemdUnit}
                    `)
                }
            } catch (mcpErr) {
                console.error(`MCP deploy for ${type} failed:`, mcpErr)
            }
        }

        // Phase 2.3.K — record the DB row so preflight + integrations tab
        // see the integration as connected. Previously only the VPS MCP got
        // deployed and the DB had no `brave`/`wordpress`/etc row → status
        // queries returned "missing".
        // fix5: add resend + gemini so they survive page reload (same bug
        // class as Brave — UI fell back to empty localStorage after refresh).
        const dbPersistTypes = ['brave', 'wordpress', 'smtp', 'replicate', 'brightdata', 'resend', 'gemini']
        if (dbPersistTypes.includes(type)) {
            try {
                const agentType = getPrimaryAgent((instance.selectedComponents as string[]) || [])
                let config: Record<string, unknown> = { connectedAt: new Date().toISOString() }
                if (type === 'wordpress' || type === 'smtp') {
                    try { config = { ...config, ...JSON.parse(key) } } catch { /* keep base */ }
                } else {
                    // For raw-API-key integrations, store a masked hint (never the
                    // full key — the key already lives in VPS env / MCP config).
                    config.maskedKey = key.slice(0, 6) + '****'
                }
                await setAgentIntegration(instanceId, agentType, type as never, config, 'connected', __agent?.id)
            } catch (intErr) {
                console.error(`agent_integrations row write for ${type} failed:`, intErr)
            }
        }

        // Update onboarding progress + save API key in DB
        // Phase 2.3.B — write per-agent fields to mateh_agents row first;
        // for primary, mirror to instances.* (legacy compat).
        const writeAgentDbField = async (agentFields: Record<string, unknown>, instanceFields?: Record<string, unknown>) => {
            if (__agent) {
                await db.update(matehAgents).set({ ...agentFields, updatedAt: new Date() } as never).where(eq(matehAgents.id, __agent.id))
                if (__agent.isPrimary && instanceFields) {
                    await db.update(instances).set(instanceFields as never).where(eq(instances.id, instanceId))
                } else if (__agent.isPrimary && !instanceFields) {
                    // Default mirror = same fields
                    await db.update(instances).set(agentFields as never).where(eq(instances.id, instanceId))
                }
            } else {
                // Legacy fallback — no agent row, use instance directly
                await db.update(instances).set((instanceFields ?? agentFields) as never).where(eq(instances.id, instanceId))
            }
        }

        if (['anthropic', 'openai', 'gemini'].includes(type)) {
            const updateData: Record<string, unknown> = {}
            if (type === 'anthropic') {
                updateData.aiProviderKey = key
                updateData.aiProviderType = 'anthropic'
            } else if (type === 'openai') {
                updateData.openaiApiKey = key
            }
            const step = (__agent?.onboardingStep ?? instance.onboardingStep) ?? 0
            if (step < 2) updateData.onboardingStep = 2
            await writeAgentDbField(updateData)
        }

        // Auto-assign sub-agent models on first API key connection
        // Only when no models are configured yet (clean slate)
        if (['anthropic', 'openai', 'groq', 'cerebras'].includes(type)) {
            const currentModels = ((__agent?.subAgentModels ?? instance.subAgentModels) as Record<string, string> | null) || {}
            if (!currentModels || Object.keys(currentModels).length === 0) {
                const defaults = getDefaultModelsForProvider(type)
                await writeAgentDbField({ subAgentModels: defaults })
                console.log(`Auto-assigned ${type} models for instance ${instanceId} (agent=${__agent?.id || 'primary'})`)

                // Register sub-agents on VPS via unified function — only for primary
                // (secondary agents have their own systemd + workspace, and
                // ensureAgentsRegistered currently targets the primary's paths only).
                if (!__agent || __agent.isPrimary) {
                    try {
                        const { ensureAgentsRegistered } = await import('@/controllers/hosting/agentSetup')
                        const [freshInst] = await db.select().from(instances).where(eq(instances.id, instanceId))
                        if (freshInst) await ensureAgentsRegistered(freshInst)
                    } catch (regErr) {
                        console.error('Agent registration after API key (non-critical):', regErr)
                    }
                }
            }
        }
        if (type === 'telegram') {
            await writeAgentDbField({
                onboardingStep: 3,
                onboardingCompleted: true,
                telegramBotToken: key,
            })
        }

        // Save sub-agent model configuration — single source of truth
        if (type === 'sub-agent-models') {
            try {
                const models = JSON.parse(key) as Record<string, string>
                await writeAgentDbField({ subAgentModels: models })

                // Re-register agents on VPS with new models — primary only
                if (!__agent || __agent.isPrimary) {
                    const { ensureAgentsRegistered } = await import('@/controllers/hosting/agentSetup')
                    const [freshInst] = await db.select().from(instances).where(eq(instances.id, instanceId))
                    if (freshInst) await ensureAgentsRegistered(freshInst)
                }
            } catch (e) {
                console.error('sub-agent-models update error:', e)
            }
        }

        // Save tool profile (messaging/full/minimal + extra tools)
        if (type === 'tool-profile') {
            try {
                const toolConfig = JSON.parse(key) as { profile: string; alsoAllow?: string[] }
                const validProfiles = ['minimal', 'messaging', 'coding', 'full']
                if (!validProfiles.includes(toolConfig.profile)) throw new Error('Invalid profile')
                const validTools = ['pdf', 'browser', 'web_fetch', 'image', 'canvas', 'edit', 'process']
                const alsoAllow = (toolConfig.alsoAllow || []).filter(t => validTools.includes(t))

                const CONFIG = '/home/openclaw/.openclaw/openclaw.json'
                // CRITICAL: stop → edit → start
                const toolsB64 = Buffer.from(JSON.stringify({ profile: toolConfig.profile, alsoAllow })).toString('base64')
                await sshExecInstance(instance, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json, base64, sys
tools_cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
agents_list = d.setdefault('agents', {}).setdefault('list', [])
main = None
for a in agents_list:
    if a.get('id') == 'main' or a.get('default'):
        main = a
        break
if not main:
    main = {'id': 'main', 'default': True}
    agents_list.append(main)
main['tools'] = tools_cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('tools profile set: ' + tools_cfg['profile'])
" '${toolsB64}' &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `)
                console.log(`Tool profile updated: ${toolConfig.profile} +${alsoAllow.join(',')}`)
            } catch (e) {
                console.error('tool-profile update error:', e)
            }
        }

        // Save model preferences (Personal/Bare agents — simple vs complex model)
        if (type === 'model-prefs') {
            try {
                const prefs = JSON.parse(key) as { simple: string; complex: string; heartbeat?: string }
                const CONFIG = '/home/openclaw/.openclaw/openclaw.json'

                // Validate model format
                if (prefs.simple && !/^[a-zA-Z0-9/_.-]+$/.test(prefs.simple)) throw new Error('Invalid simple model')
                if (prefs.complex && !/^[a-zA-Z0-9/_.-]+$/.test(prefs.complex)) throw new Error('Invalid complex model')
                if (prefs.heartbeat && !/^[a-zA-Z0-9/_.-]+$/.test(prefs.heartbeat)) throw new Error('Invalid heartbeat model')

                // CRITICAL: stop → edit → start
                const hbModel = prefs.heartbeat || prefs.simple
                const prefsB64 = Buffer.from(JSON.stringify(prefs)).toString('base64')
                await sshExecInstance(instance, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json, base64, sys
prefs = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
defaults = d.setdefault('agents', {}).setdefault('defaults', {})
model = defaults.setdefault('model', {})
model['primary'] = prefs['simple']
model['fallbacks'] = [prefs['complex']]
sa = defaults.setdefault('subagents', {})
sa['model'] = prefs['complex']
hb = defaults.setdefault('heartbeat', {})
hb['model'] = prefs.get('heartbeat', prefs['simple'])
hb['every'] = hb.get('every', '4h')
hb['lightContext'] = True
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('OK: primary=' + prefs['simple'])
" '${prefsB64}' &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `)
                console.log(`Model prefs updated: simple=${prefs.simple} complex=${prefs.complex}`)
            } catch (e) {
                console.error('model-prefs update error:', e)
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

// POST /hosting/instances/:id/integrations/test-wordpress
// Phase 4.3-O fix: backend-proxied WordPress credentials test. Eliminates
// browser CORS / Cloudflare-WAF Authorization-stripping / btoa Unicode quirks
// — server-side fetch with explicit User-Agent + clean Basic Auth construction.
// Returns structured diagnostic: { ok, status, error, hint }. Frontend renders
// `hint` in Hebrew to guide user.
export const testWordpress = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = getUserId(c)
        const instance = await getInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const { url, username, password } = await c.req.json<{ url: string; username: string; password: string }>()
        if (!url || !username || !password) return fail(c, 'url, username, password required', 400)

        // Sanitize password: strip ALL whitespace classes including NBSP, zero-width chars.
        // Done in two passes to avoid the ZWNJ+ZWJ joiner sequence in a single char class
        // (which would trip ESLint no-misleading-character-class).
        let cleanPass = password.replace(/\s/g, '')
        const hiddenChars = [0x00A0, 0x200B, 0x200C, 0x200D, 0xFEFF]
        for (const cp of hiddenChars) {
            cleanPass = cleanPass.split(String.fromCharCode(cp)).join('')
        }
        const cleanUser = username.trim()

        // Validate URL — must be absolute http(s) with hostname containing a dot
        let normalized: string
        try {
            const parsed = new URL(url)
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol')
            if (!parsed.hostname.includes('.')) throw new Error('hostname')
            normalized = parsed.origin
        } catch {
            return ok(c, { ok: false, status: 0, error: 'invalid_url', hint: 'כתובת האתר לא תקינה' })
        }

        // Server-side fetch — no CORS, no btoa quirks, Cloudflare won't strip
        // Authorization header for server-to-server requests.
        const probeUrl = `${normalized}/wp-json/wp/v2/users/me`
        const basic = Buffer.from(`${cleanUser}:${cleanPass}`, 'utf-8').toString('base64')

        let res: Response
        try {
            res = await fetch(probeUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${basic}`,
                    'User-Agent': 'Flowmatic-Integration-Test/1.0',
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(15000),
            })
        } catch (err) {
            const msg = (err as Error).message || ''
            if (/dns|enotfound|getaddrinfo|name not resolved/i.test(msg)) {
                return ok(c, { ok: false, status: 0, error: 'dns', hint: 'DNS לא מזהה את הדומיין. ודאו שה-URL נכון.' })
            }
            if (/timeout|aborted/i.test(msg)) {
                return ok(c, { ok: false, status: 0, error: 'timeout', hint: 'האתר לא ענה תוך 15 שניות.' })
            }
            return ok(c, { ok: false, status: 0, error: 'network', hint: 'שגיאת רשת: ' + msg })
        }

        const bodyText = await res.text().catch(() => '')
        let bodyJson: any = null
        try { bodyJson = JSON.parse(bodyText) } catch { /* not JSON */ }

        if (res.ok) {
            // 200 + user object back — credentials valid
            const me = bodyJson || {}
            return ok(c, {
                ok: true,
                status: res.status,
                user: { id: me.id, name: me.name, roles: me.roles },
                hint: 'אימות תקין · WordPress מחובר',
            })
        }

        // Specific WP error code → actionable Hebrew hint
        const wpCode = bodyJson?.code || ''
        const wpMsg = bodyJson?.message || bodyText.slice(0, 300)
        let hint = `שגיאה ${res.status}`
        if (res.status === 401 && /incorrect_password|invalid_username|application_passwords/i.test(wpCode + wpMsg)) {
            hint = '401 — Application Password לא תקין. ודאו: (a) זה Application Password ולא סיסמה רגילה, (b) משויך לאותו משתמש שכתבתם ב-username, (c) לא פג / לא נמחק.'
        } else if (res.status === 401) {
            hint = '401 — שם משתמש שגוי או Application Passwords מבוטל באתר (תוסף אבטחה?). פרטים: ' + wpMsg.slice(0, 150)
        } else if (res.status === 403) {
            hint = '403 — למשתמש אין הרשאות לגשת ל-REST API. הוסיפו לתפקיד Editor/Administrator.'
        } else if (res.status === 404) {
            hint = '404 — לא נמצא /wp-json/. REST API מבוטל בתוסף אבטחה (Wordfence / iThemes)?'
        }

        return ok(c, {
            ok: false,
            status: res.status,
            error: wpCode || 'http_error',
            hint,
            wpMessage: wpMsg.slice(0, 300),
        })
    } catch (err) {
        return fail(c, (err as Error).message, 500)
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

        // Read SMTP config from MCP server env in openclaw.json
        const result = await sshExecInstance(instance, `
            python3 -c "
import json, smtplib
from email.mime.text import MIMEText

with open('/home/openclaw/.openclaw/openclaw.json') as f:
    d = json.load(f)

env = d.get('mcp', {}).get('servers', {}).get('email', {}).get('env', {})
host = env.get('SMTP_HOST', '')
port = int(env.get('SMTP_PORT', '587'))
user = env.get('SMTP_USER', '')
pw = env.get('SMTP_PASS', '')

if not host or not user:
    # Fallback: try legacy skills-config
    import os
    legacy = '/home/openclaw/.openclaw/skills-config/smtp.json'
    if os.path.exists(legacy):
        with open(legacy) as f2: cfg = json.load(f2)
        host = cfg.get('host', '')
        port = int(cfg.get('port', 587))
        user = cfg.get('user', '')
        pw = cfg.get('pass', '')

if not host or not user:
    print('ERROR: SMTP not configured')
    exit(1)

msg = MIMEText('This is a test email from Flowmatic SMTP integration.\\n\\nIf you see this, SMTP is configured correctly!', 'plain', 'utf-8')
msg['Subject'] = 'Flowmatic SMTP Test'
msg['From'] = 'Flowmatic <' + user + '>'
msg['To'] = '${to.replace(/'/g, '')}'

if port == 465:
    server = smtplib.SMTP_SSL(host, port, timeout=10)
else:
    server = smtplib.SMTP(host, port, timeout=10)
    server.starttls()

server.login(user, pw)
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