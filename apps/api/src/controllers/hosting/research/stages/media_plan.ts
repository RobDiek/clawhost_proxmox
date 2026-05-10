/**
 * Stage: media_plan — campaigns, ad groups, budgets, KPIs. Thin wrapper
 * around services/mazhirMediaPlan. Same pattern as paid_audit: delegate,
 * then mark completed in plan.status. Underlying plan stays in rd.mediaPlan.
 *
 * Pre-flight check inside this wrapper is intentionally light — the heavier
 * blocker gate lives in the existing generateMazhirMediaPlan controller and
 * is reachable via its dedicated endpoint when the user wants ?force=1.
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
import { resolveActiveAgent, readResearchData } from '@/services/agentContext'

export async function run(c: Context): Promise<Response> {
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    const lock = acquireResearchLock(instanceId)
    if (!lock.acquired) {
        return fail(c, `שלב מחקר כבר רץ כרגע. נסו שוב בעוד ${lock.secondsLeft} שניות.`, 429)
    }

    try {
        // Required upstream: paid_audit must have run (mazhirAudit) and the
        // user must have a paidProfile. Surface a clear error if not.
        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!inst) { releaseResearchLock(instanceId); return fail(c, 'Instance not found', 404) }
        const __agent = await resolveActiveAgent(c, instanceId)
        const rd = await readResearchData(__agent, instanceId) as Record<string, unknown>
        if (!rd.mazhirAudit) {
            releaseResearchLock(instanceId)
            return fail(c, 'הריצו קודם אודיט פרסום ממומן (paid_audit)', 422)
        }
        if (!rd.paidProfile) {
            releaseResearchLock(instanceId)
            return fail(c, 'מלאו פרופיל פרסום ממומן לפני יצירת תוכנית מדיה', 422)
        }

        const { generateMediaPlan } = await import('@/services/mazhirMediaPlan')
        const result = await generateMediaPlan(instanceId)

        const plan = (result as { plan?: { campaigns?: unknown[] } })?.plan
        const campaignCount = Array.isArray(plan?.campaigns) ? plan.campaigns.length : 0
        const summaryMd = `# תוכנית מדיה — הושלמה

התוכנית המלאה זמינה בכרטיס "תוכנית מדיה" בלשונית פרסום ממומן.

- מספר קמפיינים: ${campaignCount}
- מצב: טיוטה — נדרש אישור לפני העלאה`

        await markWrapperStageCompleted({
            instanceId,
            stageId: 'media_plan',
            summaryMd,
            integrationsUsed: ['anthropic', 'googleAds', 'meta'],
            agentId: __agent?.id,
        })

        releaseResearchLock(instanceId)
        return ok(c, result, 'Media plan generated')
    } catch (err) {
        releaseResearchLock(instanceId)
        console.error(`[research/media_plan] error:`, err)
        return fail(c, (err as Error).message, 500)
    }
}