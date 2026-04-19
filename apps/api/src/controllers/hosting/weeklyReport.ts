/**
 * Weekly Creative Report Controller (Phase D)
 *
 *   POST .../creative/weekly-report/generate — manual trigger
 *   GET  .../creative/weekly-report/latest    — most recent report
 */

import type { Context } from 'hono'
import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { agentOutputs } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'

export const triggerWeeklyReport = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const { generateInstanceReport } = await import('@/services/weeklyCreativeReport')
        const r = await generateInstanceReport(instanceId)
        if (!r.generated) return fail(c, r.reason || 'Report not generated', 400)

        return ok(c, r, 'Report generated.')
    } catch (err) {
        console.error('triggerWeeklyReport error:', err)
        return fail(c, err instanceof Error ? err.message : 'Generate failed', 500)
    }
}

export const getLatestWeeklyReport = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const [row] = await db.select().from(agentOutputs)
            .where(and(
                eq(agentOutputs.instanceId, instanceId),
                eq(agentOutputs.outputType, 'weekly_creative_report'),
            ))
            .orderBy(desc(agentOutputs.createdAt))
            .limit(1)

        return ok(c, { report: row || null })
    } catch (err) {
        console.error('getLatestWeeklyReport error:', err)
        return fail(c, 'Fetch failed', 500)
    }
}
