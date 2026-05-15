/**
 * Paid-track Hypotheses controller — REST endpoints for Phase 4.1 Layer-3.
 *
 * (Separate from creative hypotheses in hypotheses.ts, which is Phase B6.)
 *
 * Endpoints:
 *   POST   /instances/:id/paid-hypotheses/run          → run engine, return new proposals
 *   GET    /instances/:id/paid-hypotheses              → list (filter by status)
 *   GET    /instances/:id/paid-hypotheses/:hid         → fetch single
 *   POST   /instances/:id/paid-hypotheses/:hid/approve → approve (begin manual/active flow)
 *   POST   /instances/:id/paid-hypotheses/:hid/decline → decline + reason
 *   POST   /instances/:id/paid-hypotheses/:hid/start-testing → mark testing started
 *   POST   /instances/:id/paid-hypotheses/:hid/resolve → manual resolution
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

export const runPaidHypothesesEngineController = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json().catch(() => ({}))
        const skipOpus = body?.skipOpusAudit === true

        const { runHypothesisEngine } = await import('@/services/hypothesisEngine')
        const result = await runHypothesisEngine(instanceId, { skipOpusAudit: skipOpus })

        return ok(c, result, 'Hypothesis engine completed')
    } catch (err) {
        console.error('runPaidHypothesesEngineController error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const listPaidHypotheses = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const status = c.req.query('status') || undefined
        const limit = Number(c.req.query('limit') || '50')
        const offset = Number(c.req.query('offset') || '0')

        const { listHypothesesForInstance } = await import('@/services/hypothesisEngine')
        const rows = await listHypothesesForInstance(instanceId, { status, limit, offset })
        return ok(c, { hypotheses: rows, count: rows.length })
    } catch (err) {
        console.error('listPaidHypotheses error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const getPaidHypothesisById = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hid = Number(c.req.param('hid'))
        if (!Number.isFinite(hid)) return fail(c, 'Invalid hypothesis id', 400)
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const { getHypothesis } = await import('@/services/hypothesisEngine')
        const row = await getHypothesis(instanceId, hid)
        if (!row) return fail(c, 'Hypothesis not found', 404)
        return ok(c, row)
    } catch (err) {
        console.error('getPaidHypothesisById error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const approvePaidHypothesisController = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hid = Number(c.req.param('hid'))
        if (!Number.isFinite(hid)) return fail(c, 'Invalid hypothesis id', 400)
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const { approveHypothesis } = await import('@/services/hypothesisEngine')
        await approveHypothesis(hid, 'user')
        return ok(c, { hypothesisId: hid, status: 'approved' }, 'Hypothesis approved')
    } catch (err) {
        console.error('approvePaidHypothesisController error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const declinePaidHypothesisController = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hid = Number(c.req.param('hid'))
        if (!Number.isFinite(hid)) return fail(c, 'Invalid hypothesis id', 400)
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json().catch(() => ({}))
        const reason = typeof body?.reason === 'string' ? body.reason : undefined

        const { declineHypothesis } = await import('@/services/hypothesisEngine')
        await declineHypothesis(hid, reason)
        return ok(c, { hypothesisId: hid, status: 'declined' }, 'Hypothesis declined')
    } catch (err) {
        console.error('declinePaidHypothesisController error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const startTestingPaidController = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hid = Number(c.req.param('hid'))
        if (!Number.isFinite(hid)) return fail(c, 'Invalid hypothesis id', 400)
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const { startTesting } = await import('@/services/hypothesisEngine')
        await startTesting(hid)
        return ok(c, { hypothesisId: hid, status: 'testing' }, 'Test window started')
    } catch (err) {
        console.error('startTestingPaidController error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const executePaidHypothesisController = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hid = Number(c.req.param('hid'))
        if (!Number.isFinite(hid)) return fail(c, 'Invalid hypothesis id', 400)
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const body = await c.req.json().catch(() => ({}))
        // Default to dry-run. Only run live when caller explicitly sets dryRun=false.
        const dryRun = body?.dryRun !== false

        const { executeHypothesisAction } = await import('@/services/hypothesisExecutor')
        const result = await executeHypothesisAction(hid, { dryRun, executedBy: userId || null })

        if (!result.ok) return fail(c, result.error || 'Execution failed', 400)
        return ok(c, result, dryRun ? 'Dry-run successful — confirm to execute live' : 'Hypothesis executed via API')
    } catch (err) {
        console.error('executePaidHypothesisController error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const resolvePaidHypothesisController = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const hid = Number(c.req.param('hid'))
        if (!Number.isFinite(hid)) return fail(c, 'Invalid hypothesis id', 400)
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json().catch(() => ({}))
        const resolution = body?.resolution
        if (!['validated', 'rejected', 'inconclusive'].includes(resolution)) {
            return fail(c, "resolution must be 'validated' | 'rejected' | 'inconclusive'", 400)
        }

        const { resolveHypothesis } = await import('@/services/hypothesisEngine')
        await resolveHypothesis(hid, resolution, {
            summary: body?.summary,
            summaryHe: body?.summaryHe,
            impactIls: body?.impactIls,
            evidenceSnapshot: body?.evidenceSnapshot,
        })
        return ok(c, { hypothesisId: hid, status: resolution }, `Hypothesis resolved as ${resolution}`)
    } catch (err) {
        console.error('resolvePaidHypothesisController error:', err)
        return fail(c, (err as Error).message, 500)
    }
}