/**
 * Instance version + upgrade controllers (Sprint A + B).
 *
 * Endpoints:
 *   GET  /hosting/version/manifest               — public latest manifest pass-through
 *   GET  /hosting/instances/:id/version-status   — installed-vs-latest diff
 *   POST /hosting/instances/:id/upgrade          — kick off rollback-safe upgrade
 *   GET  /hosting/instances/:id/upgrade-progress — poll progress (also via WS later)
 */

import type { Context } from 'hono'
// Use the shared JWT-parsing resolveUserId — the previous local version
// read c.get('user') which is NEVER set (no auth middleware in hosting routes),
// so every call returned null → handler responded "Instance not found" 404.
import { resolveUserId } from './authHelper'

const ok = (c: Context, data: any, message = 'OK') => c.json({ success: true, data, message })
const fail = (c: Context, message: string, status = 400) => c.json({ success: false, message }, status as any)

async function getOwnedInstanceLite(instanceId: string, userId: string | null): Promise<boolean> {
    if (!userId) return false
    const { db } = await import('@/db')
    const { instances } = await import('@/db/schema')
    const { eq, and } = await import('drizzle-orm')
    const [row] = await db.select().from(instances)
        .where(and(eq(instances.id, instanceId), eq(instances.userId, userId)))
        .limit(1)
    return !!row
}

export const getLatestManifest = async (c: Context) => {
    try {
        const { getLatestManifest } = await import('@/services/instanceVersion')
        const manifest = await getLatestManifest()
        return ok(c, manifest)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const getInstanceVersionStatus = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstanceLite(id, userId)) return fail(c, 'Instance not found', 404)
        const { getVersionStatus } = await import('@/services/instanceVersion')
        const r = await getVersionStatus(id)
        return ok(c, r)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const triggerInstanceUpgrade = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstanceLite(id, userId)) return fail(c, 'Instance not found', 404)

        // Run upgrade in background — don't block the HTTP response (it'd 504).
        // Client polls /upgrade-progress for state updates.
        const { upgradeInstance } = await import('@/services/instanceVersion')
        upgradeInstance(id).catch(err =>
            console.error(`[upgrade] background error for ${id}:`, err)
        )
        return ok(c, { instanceId: id, started: true }, 'Upgrade started — poll /upgrade-progress')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

export const getUpgradeProgressEndpoint = async (c: Context) => {
    try {
        const id = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstanceLite(id, userId)) return fail(c, 'Instance not found', 404)
        const { getUpgradeProgress } = await import('@/services/instanceVersion')
        const p = getUpgradeProgress(id)
        return ok(c, p || { instanceId: id, step: 'idle', pct: 0, status: 'idle', startedAt: null })
    } catch (err) { return fail(c, (err as Error).message, 500) }
}