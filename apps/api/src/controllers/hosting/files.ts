import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
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

function sshExec(ip: string, command: string): Promise<string> {
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
        .connect({ host: ip, port: 22, username: 'root', privateKey: getSSHKey() })
    })
}

async function getInstance(instanceId: string) {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    return instance
}

function sanitizePath(path: string): string | null {
    if (!path || path.includes('..') || path.startsWith('/')) return null
    return path.replace(/[;&|`$]/g, '')
}

// GET /hosting/instances/:id/files/tree?dir=
export const fileTree = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const dir = c.req.query('dir') || ''
        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const safePath = dir ? sanitizePath(dir) : ''
        if (safePath === null) return fail(c, 'Invalid path.', 400)

        const basePath = safePath ? `${VPS_HOME}/${safePath}` : VPS_HOME
        const output = await sshExec(instance.ip,
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
        const filePath = sanitizePath(c.req.query('path') || '')
        if (!filePath) return fail(c, 'Invalid path.', 400)

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        const content = await sshExec(instance.ip, `cat '${fullPath}' 2>/dev/null || echo '__FILE_NOT_FOUND__'`)

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
        const { path: rawPath, content } = await c.req.json<{ path: string; content: string }>()
        const filePath = sanitizePath(rawPath)
        if (!filePath) return fail(c, 'Invalid path.', 400)

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        await sshExec(instance.ip, `mkdir -p "$(dirname '${fullPath}')" && cat > '${fullPath}' << 'CLAWEOF'\n${content}\nCLAWEOF\nchown -R openclaw:openclaw ${VPS_HOME}`)

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
        const { path: rawPath, type } = await c.req.json<{ path: string; type: 'file' | 'dir' }>()
        const filePath = sanitizePath(rawPath)
        if (!filePath) return fail(c, 'Invalid path.', 400)

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        if (type === 'dir') {
            await sshExec(instance.ip, `mkdir -p '${fullPath}' && chown -R openclaw:openclaw ${VPS_HOME}`)
        } else {
            await sshExec(instance.ip, `mkdir -p "$(dirname '${fullPath}')" && touch '${fullPath}' && chown -R openclaw:openclaw ${VPS_HOME}`)
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
        const filePath = sanitizePath(c.req.query('path') || '')
        if (!filePath) return fail(c, 'Invalid path.', 400)

        // Safety: don't allow deleting critical files
        const protected_paths = ['.openclaw/openclaw.json']
        if (protected_paths.some(p => filePath.endsWith(p))) {
            return fail(c, 'Cannot delete protected file.', 403)
        }

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${VPS_HOME}/${filePath}`
        await sshExec(instance.ip, `rm -rf '${fullPath}'`)

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
        const { from, to } = await c.req.json<{ from: string; to: string }>()
        const fromPath = sanitizePath(from)
        const toPath = sanitizePath(to)
        if (!fromPath || !toPath) return fail(c, 'Invalid paths.', 400)

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        await sshExec(instance.ip, `mv '${VPS_HOME}/${fromPath}' '${VPS_HOME}/${toPath}' && chown -R openclaw:openclaw ${VPS_HOME}`)

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
        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const output = await sshExec(instance.ip, `
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
        const lines = parseInt(c.req.query('lines') || '50')
        const service = c.req.query('service') || 'openclaw-gateway'

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const allowedServices = ['openclaw-gateway', 'nginx', 'docker']
        if (!allowedServices.includes(service)) return fail(c, 'Invalid service.', 400)

        const output = await sshExec(instance.ip, `journalctl -u ${service} --no-pager -n ${Math.min(lines, 500)} 2>/dev/null || echo 'No logs available'`)

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
        const { name, soul, model } = await c.req.json<{ name: string; soul: string; model: string }>()
        if (!name || !soul) return fail(c, 'Name and soul are required.', 400)

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
        const agentPath = `${VPS_HOME}/.openclaw/agents/${slug}`

        await sshExec(instance.ip, `
            mkdir -p '${agentPath}/output' &&
            cat > '${agentPath}/SOUL.md' << 'SOULEOF'
${soul}
SOULEOF
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
        const { type, key } = await c.req.json<{ type: string; key: string }>()
        if (!type || !key) return fail(c, 'Type and key are required.', 400)

        const instance = await getInstance(instanceId)
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const commands: Record<string, string> = {
            anthropic: `cd /home/openclaw && openclaw provider add anthropic --api-key "${key}" 2>/dev/null || (mkdir -p ${VPS_HOME}/providers && echo '{"provider":"anthropic","apiKey":"${key}"}' > ${VPS_HOME}/providers/anthropic.json)`,
            openai: `cd /home/openclaw && openclaw provider add openai --api-key "${key}" 2>/dev/null || (mkdir -p ${VPS_HOME}/providers && echo '{"provider":"openai","apiKey":"${key}"}' > ${VPS_HOME}/providers/openai.json)`,
            gemini: `mkdir -p ${VPS_HOME}/providers && echo '{"provider":"gemini","apiKey":"${key}"}' > ${VPS_HOME}/providers/gemini.json`,
            telegram: `cd /home/openclaw && openclaw channel add telegram --token "${key}" 2>/dev/null || (mkdir -p ${VPS_HOME}/channels && echo '{"channel":"telegram","token":"${key}"}' > ${VPS_HOME}/channels/telegram.json)`,
            brave: `mkdir -p ${VPS_HOME}/skills-config && echo '{"braveApiKey":"${key}"}' > ${VPS_HOME}/skills-config/brave-search.json`,
            brightdata: `mkdir -p ${VPS_HOME}/skills-config && echo '{"apiKey":"${key}"}' > ${VPS_HOME}/skills-config/bright-data.json`,
            replicate: `mkdir -p ${VPS_HOME}/skills-config && echo '{"apiToken":"${key}"}' > ${VPS_HOME}/skills-config/replicate.json`,
            ollama: `cd /home/openclaw && openclaw provider add ollama --model "${key}" 2>/dev/null || (mkdir -p ${VPS_HOME}/providers && echo '{"provider":"ollama","model":"${key}"}' > ${VPS_HOME}/providers/ollama.json)`,
            resend: `mkdir -p ${VPS_HOME}/skills-config && echo '{"apiKey":"${key}"}' > ${VPS_HOME}/skills-config/resend.json`,
        }

        const cmd = commands[type]
        if (!cmd) return fail(c, 'Unknown integration type.', 400)

        await sshExec(instance.ip, `${cmd} && chown -R openclaw:openclaw /home/openclaw/.openclaw && systemctl restart openclaw-gateway`)

        // Update onboarding progress based on integration type
        if (['anthropic', 'openai', 'gemini'].includes(type)) {
            const step = instance.onboardingStep ?? 0
            if (step < 2) {
                await db.update(instances).set({ onboardingStep: 2 }).where(eq(instances.id, instanceId))
            }
        }
        if (type === 'telegram') {
            await db.update(instances).set({
                onboardingStep: 3,
                onboardingCompleted: true,
                telegramBotToken: key
            }).where(eq(instances.id, instanceId))
        }

        return ok(c, { type }, 'Integration saved.')
    } catch (err) {
        console.error('saveIntegration error:', err)
        return fail(c, 'Failed to save integration.', 500)
    }
}
