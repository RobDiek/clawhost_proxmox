import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const OPENCLAW_BASE = '/home/openclaw/.openclaw'

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

// GET /hosting/instances/:id/files?path=workspace/SOUL.md
export const readFile = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const filePath = c.req.query('path')

        if (!filePath || filePath.includes('..')) {
            return fail(c, 'Invalid path.', 400)
        }

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${OPENCLAW_BASE}/${filePath}`
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
        const { path: filePath, content } = await c.req.json<{ path: string; content: string }>()

        if (!filePath || filePath.includes('..') || !content) {
            return fail(c, 'Invalid path or content.', 400)
        }

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = `${OPENCLAW_BASE}/${filePath}`
        const escaped = content.replace(/'/g, "'\\''")
        await sshExec(instance.ip, `mkdir -p "$(dirname '${fullPath}')" && cat > '${fullPath}' << 'CLAWEOF'\n${content}\nCLAWEOF\nchown -R openclaw:openclaw ${OPENCLAW_BASE}`)

        return ok(c, { path: filePath }, 'File saved.')
    } catch (err) {
        console.error('writeFile error:', err)
        return fail(c, 'Failed to save file.', 500)
    }
}

// GET /hosting/instances/:id/files/list?dir=workspace
export const listFiles = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const dir = c.req.query('dir') || ''

        if (dir.includes('..')) return fail(c, 'Invalid path.', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const fullPath = dir ? `${OPENCLAW_BASE}/${dir}` : OPENCLAW_BASE
        const output = await sshExec(instance.ip, `find '${fullPath}' -maxdepth 2 -type f -name '*.md' -o -name '*.json' 2>/dev/null | sort`)

        const files = output.trim().split('\n')
            .filter(f => f.length > 0)
            .map(f => f.replace(OPENCLAW_BASE + '/', ''))

        return ok(c, { dir, files }, 'Files listed.')
    } catch (err) {
        console.error('listFiles error:', err)
        return fail(c, 'Failed to list files.', 500)
    }
}

// POST /hosting/instances/:id/files/deploy-agent
export const deployCustomAgent = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const { name, soul, model } = await c.req.json<{ name: string; soul: string; model: string }>()

        if (!name || !soul) return fail(c, 'Name and soul are required.', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
        const agentPath = `${OPENCLAW_BASE}/agents/${slug}`

        await sshExec(instance.ip, `
            mkdir -p '${agentPath}/output' &&
            cat > '${agentPath}/SOUL.md' << 'SOULEOF'
${soul}
SOULEOF
            chown -R openclaw:openclaw ${OPENCLAW_BASE} &&
            systemctl restart openclaw-gateway
        `)

        return ok(c, { slug, path: `agents/${slug}/SOUL.md` }, 'Agent deployed.')
    } catch (err) {
        console.error('deployCustomAgent error:', err)
        return fail(c, 'Failed to deploy agent.', 500)
    }
}

// POST /hosting/instances/:id/integrations/save
export const saveIntegration = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const { type, key } = await c.req.json<{ type: string; key: string }>()

        if (!type || !key) return fail(c, 'Type and key are required.', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not found.', 404)

        const commands: Record<string, string> = {
            anthropic: `cd /home/openclaw && openclaw provider add anthropic --api-key "${key}" 2>/dev/null || (mkdir -p .openclaw/providers && echo '{"provider":"anthropic","apiKey":"${key}"}' > .openclaw/providers/anthropic.json)`,
            openai: `cd /home/openclaw && openclaw provider add openai --api-key "${key}" 2>/dev/null || (mkdir -p .openclaw/providers && echo '{"provider":"openai","apiKey":"${key}"}' > .openclaw/providers/openai.json)`,
            gemini: `mkdir -p /home/openclaw/.openclaw/providers && echo '{"provider":"gemini","apiKey":"${key}"}' > /home/openclaw/.openclaw/providers/gemini.json`,
            telegram: `cd /home/openclaw && openclaw channel add telegram --token "${key}" 2>/dev/null || (mkdir -p .openclaw/channels && echo '{"channel":"telegram","token":"${key}"}' > .openclaw/channels/telegram.json)`,
            brave: `mkdir -p /home/openclaw/.openclaw/skills-config && echo '{"braveApiKey":"${key}"}' > /home/openclaw/.openclaw/skills-config/brave-search.json`,
            brightdata: `mkdir -p /home/openclaw/.openclaw/skills-config && echo '{"apiKey":"${key}"}' > /home/openclaw/.openclaw/skills-config/bright-data.json`,
            replicate: `mkdir -p /home/openclaw/.openclaw/skills-config && echo '{"apiToken":"${key}"}' > /home/openclaw/.openclaw/skills-config/replicate.json`,
        }

        const cmd = commands[type]
        if (!cmd) return fail(c, 'Unknown integration type.', 400)

        await sshExec(instance.ip, `${cmd} && chown -R openclaw:openclaw /home/openclaw/.openclaw`)

        return ok(c, { type }, 'Integration saved.')
    } catch (err) {
        console.error('saveIntegration error:', err)
        return fail(c, 'Failed to save integration.', 500)
    }
}
