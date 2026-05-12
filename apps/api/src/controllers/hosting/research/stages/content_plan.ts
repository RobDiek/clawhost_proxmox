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
import { resolveActiveAgent, readResearchData, writeResearchData } from '@/services/agentContext'

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const __agentForLock = await resolveActiveAgent(c, instanceId)
    const lock = acquireResearchLock(instanceId, 'content_plan', __agentForLock?.id)
    if (!lock.acquired) {
        return fail(c, `שלב מחקר כבר רץ כרגע. נסו שוב בעוד ${lock.secondsLeft} שניות.`, 429)
    }

    try {
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst) { releaseResearchLock(instanceId); return fail(c, 'Instance not found', 404) }
        const __agent = await resolveActiveAgent(c, instanceId)
        const rd = await readResearchData(__agent, instanceId) as Record<string, unknown>

        // Gate: content plan needs a chosen scenario. Two sources, in order:
        //   1. rd.chosenScenario — legacy commit endpoint, still honored
        //   2. NEW strategy_options stage output (results.strategy_options.
        //      records[]) — auto-default to the highest-confidence record
        //      so the user doesn't have to make a separate commit click
        //      after running strategy_options. They can always override
        //      via the commit endpoint later.
        if (!rd.chosenScenario) {
            const results = (rd.results as Record<string, { records?: Array<Record<string, unknown>> }> | undefined) || {}
            const strategyRecords = results.strategy_options?.records
            if (Array.isArray(strategyRecords) && strategyRecords.length > 0) {
                // Pick highest confidence; tie-break by stage order (smart usually first).
                const scored = strategyRecords.map((r, idx) => ({
                    r,
                    rank: r.confidence === 'high' ? 0 : r.confidence === 'medium' ? 1 : 2,
                    idx,
                }))
                scored.sort((a, b) => a.rank - b.rank || a.idx - b.idx)
                const auto = scored[0].r
                rd.chosenScenario = {
                    ...auto,
                    _autoSelected: true,
                    _autoSelectedAt: new Date().toISOString(),
                    _autoSelectedReason: `strategy_options.records[${scored[0].idx}] (confidence=${auto.confidence || 'unknown'})`,
                }
                // Persist so future runs see it.
                await writeResearchData(__agent, instanceId, rd)
                console.log(`[research/content_plan] auto-selected scenario: ${(auto as { scenario?: string }).scenario || 'unknown'} (${auto.confidence})`)
            } else {
                releaseResearchLock(instanceId)
                return fail(c, 'תחילה הריצו את שלב אסטרטגיה (strategy_options) — content_plan נשען על המסלול שנבחר שם.', 422)
            }
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

        await writeResearchData(__agent, instanceId, {
            ...rd,
            contentPlan: finalPlan,
            contentPlanGeneratedAt: new Date().toISOString(),
            contentPlanHorizonWeeks: weeksAhead,
        })

        const summaryMd = `# תוכנית תוכן — הושלמה

לוח עריכה ל-${weeksAhead} שבועות זמין בלשונית "תוכן" של הסוכן.

- מספר פריטים חדשים: ${plan.length}
- פריטים שבעבודה (נשמרו): ${inProgress.length}`

        await markWrapperStageCompleted({
            instanceId,
            stageId: 'content_plan',
            summaryMd,
            integrationsUsed: ['anthropic'],
            agentId: __agent?.id,
        })

        releaseResearchLock(instanceId)
        return ok(c, { plan: finalPlan, count: finalPlan.length }, 'Content plan ready')
    } catch (err) {
        releaseResearchLock(instanceId)
        console.error(`[research/content_plan] error:`, err)
        return fail(c, (err as Error).message, 500)
    }
}