/**
 * paidLearner controller — admin/cron entry points for the Performance Loop.
 *
 * Endpoints:
 *   POST  /instances/:id/paid-learnings/aggregate  → run aggregation (manual / cron)
 *   GET   /instances/:id/paid-learnings            → list current learnings (window_end DESC)
 *   GET   /instances/:id/paid-learnings/injectable → preview the block opusAudit will see
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { eq, and, desc, sql } from 'drizzle-orm'

export const runPaidLearnerAggregation = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const body = await c.req.json<{ windowDays?: number; agentId?: string }>()
            .catch(() => ({} as { windowDays?: number; agentId?: string }))
        const { aggregatePaidLearnings } = await import('@/services/paidLearner/aggregate')
        const result = await aggregatePaidLearnings({
            instanceId,
            windowDays: body.windowDays ?? 28,
            agentId: body.agentId ?? null,
        })
        return ok(c, result, 'Paid learnings aggregated')
    } catch (err) {
        console.error('runPaidLearnerAggregation error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const listPaidLearnings = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const grouping = c.req.query('grouping')
        const onlyInjectable = c.req.query('injectableOnly') === 'true'
        const limit = Math.min(Number(c.req.query('limit') || '50'), 200)

        const { paidLearnings } = await import('@/db/schema')
        const { db } = await import('@/db')

        const conditions = [eq(paidLearnings.instanceId, instanceId)]
        if (grouping) conditions.push(eq(paidLearnings.grouping, grouping))
        if (onlyInjectable) conditions.push(eq(paidLearnings.injectIntoPrompts, true))

        const rows = await db.select().from(paidLearnings)
            .where(and(...conditions))
            .orderBy(desc(paidLearnings.windowEnd), sql`sample_size DESC`)
            .limit(limit)

        return ok(c, { learnings: rows, count: rows.length })
    } catch (err) {
        console.error('listPaidLearnings error:', err)
        return fail(c, (err as Error).message, 500)
    }
}

export const previewPaidLearningsInjection = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const { fetchLearningsForInjection } = await import('@/services/paidLearner/inject')
        const block = await fetchLearningsForInjection(instanceId)
        return ok(c, block)
    } catch (err) {
        console.error('previewPaidLearningsInjection error:', err)
        return fail(c, (err as Error).message, 500)
    }
}