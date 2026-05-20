/**
 * Phase 4.7 — stage dependency-impact endpoints.
 *
 *   GET  /hosting/instances/:id/research/stage/:stageId/impact
 *        → returns { downstreamStages, wrapperArtifacts, currentlyAffected }
 *          where `currentlyAffected` lists only those downstream stages that
 *          actually have data right now (so the UI's confirm dialog can show
 *          a short, accurate list rather than the full theoretical graph).
 *
 *   POST /hosting/instances/:id/research/stage/:stageId/wipe-downstream
 *        → clears results[downstream] + plan.status[downstream]=pending +
 *          deletes wrapper artifacts (mazhirAudit, mediaPlan, etc.). Run
 *          BEFORE the user kicks off the re-run, only after the user
 *          confirmed the impact dialog.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../authHelper'
import { ALL_STAGE_IDS, type StageId } from '@/services/research/types'

export const getStageImpact = async (c: Context) => {
    try {
        const stageId = c.req.param('stageId') as StageId
        if (!(ALL_STAGE_IDS as readonly string[]).includes(stageId)) {
            return fail(c, `Unknown stageId: ${stageId}`, 400)
        }
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const { computeStageImpact } = await import('@/services/research/dependencyGraph')
        const impact = computeStageImpact(stageId)

        // Phase 4.3-O systemic-fix: per-active-agent — each agent has its own
        // result set, so impact reporting must scope to active agent.
        const { readResearchDataForActive } = await import('@/services/agentContext')
        const { rd: rdActive } = await readResearchDataForActive(c, instanceId)
        const rd = rdActive as Record<string, unknown>
        const results = (rd.results as Record<string, unknown>) || {}
        const currentlyAffectedStages = impact.downstreamStages.filter(
            (s) => results[s] !== undefined && results[s] !== null,
        )
        const currentlyAffectedWrappers = impact.wrapperArtifacts.filter(
            (w) => rd[w] !== undefined && rd[w] !== null,
        )

        return ok(c, {
            stageId,
            downstreamStages: impact.downstreamStages,
            wrapperArtifacts: impact.wrapperArtifacts,
            currentlyAffectedStages,
            currentlyAffectedWrappers,
            // Combined boolean — UI uses this to decide whether to show confirm
            hasAnyImpact: currentlyAffectedStages.length > 0 || currentlyAffectedWrappers.length > 0,
        })
    } catch (err) {
        console.error('getStageImpact error:', err)
        return fail(c, 'Failed to compute stage impact', 500)
    }
}

export const wipeStageDownstream = async (c: Context) => {
    try {
        const stageId = c.req.param('stageId') as StageId
        if (!(ALL_STAGE_IDS as readonly string[]).includes(stageId)) {
            return fail(c, `Unknown stageId: ${stageId}`, 400)
        }
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        if (!await getOwnedInstance(instanceId, userId)) return fail(c, 'Instance not found', 404)

        const agentId = c.req.query('agentId') || undefined

        const { wipeDownstreamResults } = await import('@/services/research/stageExecutor')
        const result = await wipeDownstreamResults(instanceId, stageId, agentId)

        return ok(c, result, 'Downstream stages and wrapper artifacts cleared')
    } catch (err) {
        console.error('wipeStageDownstream error:', err)
        return fail(c, (err as Error).message || 'Failed to wipe downstream', 500)
    }
}