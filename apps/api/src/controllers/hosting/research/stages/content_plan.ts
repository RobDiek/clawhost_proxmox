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

        // Gate: content plan needs an EXPLICITLY CHOSEN scenario (Phase 2026.01).
        // Previously the stage auto-selected the highest-confidence record from
        // strategy_options.records — but per ClawFlow policy of no automatic
        // strategic actions ([[feedback-no-automatic-actions]]) and to make the
        // smart-vs-aggressive tradeoff visible to the user, this gate now hard
        // fails until the user calls POST /research/scenario/choose explicitly.
        // An auto-selected scenario (_autoSelected:true) does NOT pass the gate —
        // user must reconfirm via the explicit choose endpoint.
        const chosen = rd.chosenScenario as { chosenByUser?: boolean; scenario?: string; _autoSelected?: boolean } | undefined
        const isExplicit = !!(chosen && chosen.chosenByUser === true)
        if (!isExplicit) {
            releaseResearchLock(instanceId)
            const results = (rd.results as Record<string, { records?: Array<Record<string, unknown>> }> | undefined) || {}
            const stratRecords = results.strategy_options?.records
            if (!Array.isArray(stratRecords) || stratRecords.length === 0) {
                return fail(c, 'תחילה הריצו את שלב אסטרטגיה (strategy_options) — content_plan נשען על המסלול שנבחר שם.', 422)
            }
            return fail(c, 'בחרו תרחיש אסטרטגיה לפני הרצת תוכנית התוכן: smart או aggressive. גלילו לכרטיסי האסטרטגיה ולחצו "בחר תרחיש זה".', 422)
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

        // Phase 4.0(fix13) — surface plan items as records so UI per-stage
        // panel can render them inline. Legacy rd.contentPlan stays as
        // the source-of-truth for the calendar widget.
        const chosenScenarioForExtras = rd.chosenScenario as Record<string, unknown> | undefined
        await markWrapperStageCompleted({
            instanceId,
            stageId: 'content_plan',
            summaryMd,
            integrationsUsed: ['anthropic'],
            agentId: __agent?.id,
            records: finalPlan,
            extras: {
                horizon_weeks: weeksAhead,
                new_items_count: plan.length,
                preserved_in_progress_count: inProgress.length,
                chosen_scenario_summary: chosenScenarioForExtras
                    ? {
                        scenario: chosenScenarioForExtras.scenario,
                        confidence: chosenScenarioForExtras.confidence,
                        auto_selected: !!chosenScenarioForExtras._autoSelected,
                        auto_selected_reason: chosenScenarioForExtras._autoSelectedReason,
                    }
                    : undefined,
            },
            confidence: chosenScenarioForExtras?.confidence as 'high' | 'medium' | 'working_hypothesis' | undefined,
        })

        releaseResearchLock(instanceId)
        return ok(c, { plan: finalPlan, count: finalPlan.length }, 'Content plan ready')
    } catch (err) {
        releaseResearchLock(instanceId)
        console.error(`[research/content_plan] error:`, err)
        return fail(c, (err as Error).message, 500)
    }
}