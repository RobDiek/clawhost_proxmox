/**
 * Stage: paid_audit — Google Ads + Meta paid audit. Thin wrapper around
 * services/mazhirAudit. We delegate the actual audit, then mark the stage
 * completed in plan.status so the pipeline widget reflects it.
 *
 * Underlying data stays in rd.mazhirAudit (its existing home) — UI for the
 * paid section reads from there directly and is unchanged.
 */

import type { Context } from 'hono'
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
        const { runMazhirAudit } = await import('@/services/mazhirAudit')
        const { audit, cost } = await runMazhirAudit(instanceId)

        // Build a brief Hebrew summary as the StageResult.content. UI for
        // the audit itself reads rd.mazhirAudit — this is just a marker so
        // the pipeline widget shows the stage as completed.
        const blockers = Array.isArray((audit as { blockers?: unknown[] })?.blockers)
            ? (audit as { blockers?: unknown[] }).blockers!.length : 0
        const summaryMd = `# אודיט פרסום ממומן — הושלם

האודיט המלא זמין בכרטיס "מזהיר — אודיט" בלשונית פרסום ממומן.

- מספר חסמים שזוהו: ${blockers}
- עלות הרצה: $${(cost as { totalUsd?: number })?.totalUsd?.toFixed(4) || '0.0000'}`

        await markWrapperStageCompleted({
            instanceId,
            stageId: 'paid_audit',
            summaryMd,
            integrationsUsed: ['anthropic', 'googleAds', 'meta'],
        })

        releaseResearchLock(instanceId)
        return ok(c, { audit, cost }, 'Audit complete')
    } catch (err) {
        releaseResearchLock(instanceId)
        console.error(`[research/paid_audit] error:`, err)
        return fail(c, (err as Error).message, 500)
    }
}