/**
 * Langfuse Controller — LLM observability status and access.
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

// GET /hosting/instances/:id/langfuse/status
export const getLangfuseStatus = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Langfuse is always deployed on every VPS
        const subdomainName = instance.subdomainName || instanceId
        const langfuseUrl = `https://${subdomainName}-obs.clawflow.flowmatic.co.il`

        // Check if Langfuse is responding
        let running = false
        if (instance.ip) {
            try {
                const res = await fetch(`http://${instance.ip}:3200/api/public/health`, {
                    signal: AbortSignal.timeout(5000)
                })
                running = res.ok
            } catch { /* not ready */ }
        }

        return ok(c, {
            running,
            url: langfuseUrl,
            // Credentials returned only to authenticated instance owner
            loginEmail: 'admin@openclaw.local',
        }, 'Langfuse status retrieved')
    } catch (err) {
        console.error('getLangfuseStatus error:', err)
        return fail(c, 'Failed to get Langfuse status', 500)
    }
}
