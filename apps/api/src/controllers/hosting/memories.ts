import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || ''

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
                stream.on('close', () => { conn.end(); resolve(output.trim()) })
            })
        }).on('error', reject)
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

// Sanitize: only allow UUID-like or numeric point IDs
function sanitizePointId(id: string): string | null {
    if (/^[a-f0-9-]{1,64}$/i.test(id) || /^\d+$/.test(id)) return id
    return null
}

function qdrantAuthHeader(instanceApiKey?: string): string {
    const key = instanceApiKey || QDRANT_API_KEY
    return key ? `-H "api-key: ${key}"` : ''
}

// Query Qdrant on client VPS via SSH
async function qdrantQuery(ip: string, password: string | undefined, method: string, path: string, body?: string): Promise<string> {
    const auth = qdrantAuthHeader()
    const bodyFlag = body ? `-d '${body}'` : ''
    return sshExec(ip, `
        curl -sf -X ${method} http://127.0.0.1:6333${path} \\
          -H "Content-Type: application/json" ${auth} \\
          ${bodyFlag} 2>/dev/null || echo '{}'
    `, password)
}

// GET /hosting/instances/:id/memories
export const getMemories = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        const result = await qdrantQuery(
            instance.ip, instance.rootPassword || undefined,
            'POST', '/collections/openclaw_memories/points/scroll',
            '{"limit":200,"with_payload":true}'
        )

        let memories: { id: string; memory: string; created_at?: string; agent?: string }[] = []
        try {
            const parsed = JSON.parse(result)
            const points = parsed.result?.points || []
            memories = points.map((p: any) => ({
                id: String(p.id),
                memory: p.payload?.memory || p.payload?.text || p.payload?.data || '',
                created_at: p.payload?.created_at || p.payload?.timestamp || null,
                agent: p.payload?.agent_id || p.payload?.agent || null,
            })).filter((m: any) => m.memory && m.memory.length > 0)
        } catch { /* parse error — return empty */ }

        return ok(c, memories, `${memories.length} memories`)
    } catch (err) {
        console.error('getMemories error:', err)
        return fail(c, 'Failed to get memories', 500)
    }
}

// DELETE /hosting/instances/:id/memories/:memoryId
export const deleteMemory = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const memoryId = c.req.param('memoryId')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        // Sanitize memoryId to prevent command injection
        const safeId = sanitizePointId(memoryId)
        if (!safeId) return fail(c, 'Invalid memory ID format', 400)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        await qdrantQuery(
            instance.ip, instance.rootPassword || undefined,
            'POST', '/collections/openclaw_memories/points/delete',
            `{"points":["${safeId}"]}`
        )

        return ok(c, null, 'Memory deleted')
    } catch (err) {
        console.error('deleteMemory error:', err)
        return fail(c, 'Failed to delete memory', 500)
    }
}

// DELETE /hosting/instances/:id/memories (clear all)
export const clearMemories = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        // Delete collection entirely, let Mem0 plugin recreate it on next use
        // (plugin creates collection with correct vector dimensions automatically)
        await qdrantQuery(
            instance.ip, instance.rootPassword || undefined,
            'DELETE', '/collections/openclaw_memories'
        )

        return ok(c, null, 'All memories cleared')
    } catch (err) {
        console.error('clearMemories error:', err)
        return fail(c, 'Failed to clear memories', 500)
    }
}