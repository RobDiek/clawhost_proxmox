/**
 * Cross-Platform Truth controller — Phase 4.4.
 *
 * Single endpoint exposes MER + aMER + per-platform trust + composite score
 * so the dashboard can render the "ניתוח מאוחד" widget on home in one
 * round-trip.
 *
 *   GET /instances/:id/cross-platform-truth?windowDays=30
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

export const getCrossPlatformTruthController = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const windowDays = Math.max(7, Math.min(90, Number(c.req.query('windowDays') || '30')))

        const { getCrossPlatformTruth } = await import('@/services/crossPlatformTruth')
        const truth = await getCrossPlatformTruth(instanceId, { windowDays })

        return ok(c, truth)
    } catch (err) {
        console.error('getCrossPlatformTruthController error:', err)
        return fail(c, (err as Error).message, 500)
    }
}