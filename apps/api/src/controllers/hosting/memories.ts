import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

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

// GET /hosting/instances/:id/memories
export const getMemories = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        // Query Qdrant directly for all memories
        const result = await sshExec(instance.ip, `
            curl -sf http://127.0.0.1:6333/collections/openclaw_memories/points/scroll \\
              -H "Content-Type: application/json" \\
              -d '{"limit":200,"with_payload":true}' 2>/dev/null || echo '{"result":{"points":[]}}'
        `, instance.rootPassword || undefined)

        let memories: { id: string; memory: string; created_at?: string }[] = []
        try {
            const parsed = JSON.parse(result)
            const points = parsed.result?.points || []
            memories = points.map((p: any) => ({
                id: String(p.id),
                memory: p.payload?.memory || p.payload?.text || p.payload?.data || JSON.stringify(p.payload || {}),
                created_at: p.payload?.created_at || p.payload?.timestamp || null,
            })).filter((m: any) => m.memory && m.memory !== '{}')
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

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) return fail(c, 'Instance not ready', 400)

        await sshExec(instance.ip, `
            curl -sf -X POST http://127.0.0.1:6333/collections/openclaw_memories/points/delete \\
              -H "Content-Type: application/json" \\
              -d '{"points":["${memoryId}"]}' 2>/dev/null || true
        `, instance.rootPassword || undefined)

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

        // Delete and recreate collection
        await sshExec(instance.ip, `
            curl -sf -X DELETE http://127.0.0.1:6333/collections/openclaw_memories 2>/dev/null || true
            sleep 1
            curl -sf -X PUT http://127.0.0.1:6333/collections/openclaw_memories \\
              -H "Content-Type: application/json" \\
              -d '{"vectors":{"size":384,"distance":"Cosine"}}' 2>/dev/null || true
        `, instance.rootPassword || undefined)

        return ok(c, null, 'All memories cleared')
    } catch (err) {
        console.error('clearMemories error:', err)
        return fail(c, 'Failed to clear memories', 500)
    }
}
