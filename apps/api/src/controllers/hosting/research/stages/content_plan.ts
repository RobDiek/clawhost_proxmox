/**
 * Stage: content_plan — 4-week (default) editorial calendar wrapping the
 * existing services/planDraftRunner pipeline. Same pattern as paid_audit:
 * delegate, then mark plan.status[content_plan] completed.
 *
 * Underlying plan stays in rd.contentPlan — calendar UI and the 4-pass
 * Skeleton→Draft→QA pipeline are unchanged.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { fail, ok } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../../authHelper'
import {
    acquireResearchLock,
    releaseResearchLock,
} from '@/services/research/stageExecutor'
import { markWrapperStageCompleted } from './_wrapperHelpers'

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const lock = acquireResearchLock(instanceId)
    if (!lock.acquired) {
        return fail(c, `שלב מחקר כבר רץ כרגע. נסו שוב בעוד ${lock.secondsLeft} שניות.`, 429)
    }

    try {
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const rd = (inst?.researchData as Record<string, unknown> | null) || {}

        // Gate: content plan requires a chosen scenario (commit step) — same
        // gate as the existing regenerateContentPlan handler.
        if (!rd.chosenScenario) {
            releaseResearchLock(instanceId)
            return fail(c, 'בחרו קודם מסלול ביצוע (Smart / All-In) בשלב strategy_options', 422)
        }

        const body = await c.req.json<{ weeksAhead?: number; startDate?: string }>().catch(() => ({} as { weeksAhead?: number; startDate?: string }))
        const startDate = body.startDate ? new Date(body.startDate) : new Date()
        const weeksAhead = body.weeksAhead || 4

        const { generateContentPlan } = await import('../../agentSetup')
        const plan = await generateContentPlan(instanceId, { weeksAhead, startDate })

        // Persist the new plan items, preserving in-progress items (matches
        // the existing regenerateContentPlan handler's preservation logic so
        // running this stage doesn't lose drafts).
        const existingPlan = Array.isArray(rd.contentPlan) ? (rd.contentPlan as Array<{ status?: string }>) : []
        const inProgress = existingPlan.filter(it =>
            ['drafting', 'awaiting_review', 'approved', 'scheduled', 'published', 'ready_for_manual'].includes(it.status || '')
        )
        const finalPlan = [...plan, ...inProgress] as unknown[]

        await db.update(instances).set({
            researchData: {
                ...rd,
                contentPlan: finalPlan,
                contentPlanGeneratedAt: new Date().toISOString(),
                contentPlanHorizonWeeks: weeksAhead,
            } as never,
        }).where(eq(instances.id, instanceId))

        const summaryMd = `# תוכנית תוכן — הושלמה

לוח עריכה ל-${weeksAhead} שבועות זמין בלשונית "תוכן" של הסוכן.

- מספר פריטים חדשים: ${plan.length}
- פריטים שבעבודה (נשמרו): ${inProgress.length}`

        await markWrapperStageCompleted({
            instanceId,
            stageId: 'content_plan',
            summaryMd,
            integrationsUsed: ['anthropic'],
        })

        releaseResearchLock(instanceId)
        return ok(c, { plan: finalPlan, count: finalPlan.length }, 'Content plan ready')
    } catch (err) {
        releaseResearchLock(instanceId)
        console.error(`[research/content_plan] error:`, err)
        return fail(c, (err as Error).message, 500)
    }
}