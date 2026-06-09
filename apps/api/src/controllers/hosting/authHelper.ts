/**
 * Shared auth helper for all hosting controllers.
 * Single source of truth for JWT parsing + instance ownership check.
 */
import type { Context } from 'hono'
import crypto from 'crypto'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

const getSecret = () => process.env.JWT_SECRET || ''

/**
 * Verify a raw JWT (no "Bearer " prefix) and return its userId (`sub`), or null
 * if signature/exp invalid. Shared by HTTP auth and the WebSocket servers
 * (terminal / claude-dev) which receive the token as a query param.
 */
export function userIdFromJwt(token: string | null | undefined): string | null {
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
        return payload.sub || null
    } catch { return null }
}

/** Extract userId from JWT Bearer token or HonoEnv middleware */
export function resolveUserId(c: Context): string | null {
    // Try HonoEnv middleware first
    try {
        const id = (c as any).get('userId')
        if (id) return id
    } catch {}

    // Fallback: parse JWT from Authorization header
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return userIdFromJwt(auth.slice(7))
}

/** Get instance with ownership check. Returns null if userId doesn't match. */
export async function getOwnedInstance(instanceId: string, userId: string | null) {
    if (!userId) return null
    const [instance] = await db.select().from(instances)
        .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
    return instance || null
}