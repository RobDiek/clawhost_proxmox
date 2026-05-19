/**
 * Phase 4.3-K: instance-readiness gate for pending_review output emission.
 *
 * Background: weeklyOpsBrief cron, planDraftRunner cron, and other autonomous
 * generators fire on schedule regardless of whether the user has actually
 * completed onboarding. They accumulate pending_review rows in agent_outputs
 * that are noise for the user (no monthly plan yet → weekly brief has nothing
 * meaningful to compare; no contentPlan approved → drafts are premature).
 *
 * Systemic fix: BEFORE inserting a pending_review row, generators call
 * `shouldEmitToReviewQueue(instanceId, outputType)`. Returns false → save
 * data to research_data internally but DO NOT publish to משימות פעילות.
 * When user later completes onboarding, the underlying data is ready and
 * the next cron fire publishes naturally.
 *
 * Output-type-specific gates:
 *   - weekly_ops_brief         needs monthlyPlan (to compare actual vs target)
 *   - content_post|blog_article|content_plan_draft   needs contentPlan items approved
 *   - paid_hypothesis          needs mediaPlan approved
 *   - monthly_task             needs monthlyPlan (self — always true if monthlyPlan generation succeeded)
 *   - default (unknown)        needs ANY of: monthlyPlan OR contentPlan items OR mediaPlan
 *
 * Per [[feedback_no_automatic_actions]] — user must see only actionable items.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { matehAgents, instances } from '@/db/schema'

export type ReadinessReason =
    | 'ok'
    | 'no_monthly_plan'
    | 'no_content_plan_approved'
    | 'no_media_plan_approved'
    | 'no_research_data'
    | 'instance_not_found'

export interface ReadinessResult {
    allow: boolean
    reason: ReadinessReason
    detail?: string
}

/**
 * Returns whether a generator should publish its output to the user's
 * pending_review queue (משימות פעילות). Always returns ok=true for
 * monthly_task (those ARE the plan and shouldn't be gated by their own
 * existence).
 */
export async function shouldEmitToReviewQueue(
    instanceId: string,
    outputType: string,
): Promise<ReadinessResult> {
    // monthly_task / monthly_marketing_plan rows are emitted DURING monthly
    // plan generation — they don't need a gate (the plan itself is the gate).
    if (outputType === 'monthly_task' || outputType === 'monthly_marketing_plan') {
        return { allow: true, reason: 'ok' }
    }

    // Pull research_data. Try primary agent first (mateh_agents — canonical for
    // multi-tenant); fall back to instances mirror for legacy single-agent
    // setups.
    let rd: any = null
    try {
        const primaryAgents = await db.select().from(matehAgents)
            .where(eq(matehAgents.vpsInstanceId, instanceId))
        const primary = primaryAgents.find((a: any) => a.id === 'mta_' + instanceId) || primaryAgents[0]
        if (primary?.researchData) {
            rd = primary.researchData
        } else {
            const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
            if (!inst) return { allow: false, reason: 'instance_not_found' }
            rd = inst.researchData || null
        }
    } catch (e) {
        console.warn(`[instanceReadinessGate] DB pull failed for ${instanceId}: ${(e as Error).message}`)
        return { allow: false, reason: 'no_research_data', detail: (e as Error).message }
    }
    if (!rd) return { allow: false, reason: 'no_research_data' }

    const hasMonthlyPlan = !!rd.monthlyPlan?.tasks?.length
    const hasMediaPlan = !!rd.mediaPlan && rd.mediaPlan.status !== 'draft'
    const hasContentPlan = !!(rd.contentPlan?.items?.length || rd.contentPlan?.status === 'approved')

    // Output-type-specific gates
    switch (outputType) {
        case 'weekly_ops_brief':
        case 'weekly_report':
            if (!hasMonthlyPlan) {
                return {
                    allow: false,
                    reason: 'no_monthly_plan',
                    detail: 'weekly brief needs monthlyPlan to compare actual-vs-target KPIs',
                }
            }
            return { allow: true, reason: 'ok' }
        case 'blog_article':
        case 'content_post':
        case 'content_plan_draft':
            if (!hasContentPlan) {
                return {
                    allow: false,
                    reason: 'no_content_plan_approved',
                    detail: 'content drafts need approved contentPlan first',
                }
            }
            return { allow: true, reason: 'ok' }
        case 'paid_hypothesis':
        case 'media_plan':
            if (!hasMediaPlan && !hasMonthlyPlan) {
                return {
                    allow: false,
                    reason: 'no_media_plan_approved',
                    detail: 'paid recommendations need media plan or monthly plan first',
                }
            }
            return { allow: true, reason: 'ok' }
        default: {
            // Unknown output type — require ANY of the 3 strategic artifacts to exist
            if (hasMonthlyPlan || hasMediaPlan || hasContentPlan) {
                return { allow: true, reason: 'ok' }
            }
            return {
                allow: false,
                reason: 'no_monthly_plan',
                detail: `output type "${outputType}" requires monthlyPlan / mediaPlan / contentPlan first`,
            }
        }
    }
}