/**
 * Stage runner — single dispatcher endpoint that routes execution to the
 * right per-stage controller. Per-stage logic lives in stages/<id>.ts.
 *
 * Spec: docs/research-pipeline-design.md §7
 *
 *   POST /hosting/instances/:id/research/stage/:stageId
 *   GET  /hosting/instances/:id/research/stage/:stageId/status
 *
 * Phase 2 ships scaffolding only: dispatcher validates the stageId and
 * forwards to the per-stage runner. Each stage runner currently returns
 * 501 Not Implemented and Phase 3 fills in the real implementations.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from '../authHelper'
import { ALL_STAGE_IDS } from '@/services/research/types'
import type { ResearchDataV2, StageId } from '@/services/research/types'

// Lazy-loaded so a single failing stage file doesn't break the dispatcher.
type StageRunner = (c: Context) => Promise<Response>
const STAGE_RUNNERS: Record<StageId, () => Promise<{ run: StageRunner }>> = {
    competitor_landscape:   () => import('./stages/competitor_landscape'),
    seo_keyword_research:   () => import('./stages/seo_keyword_research'),
    aeo_visibility:         () => import('./stages/aeo_visibility'),
    link_audit:             () => import('./stages/link_audit'),
    paid_audit:             () => import('./stages/paid_audit'),
    social_landscape:       () => import('./stages/social_landscape'),
    email_competitor_audit: () => import('./stages/email_competitor_audit'),
    audience_personas:      () => import('./stages/audience_personas'),
    positioning:            () => import('./stages/positioning'),
    strategy_options:       () => import('./stages/strategy_options'),
    validation:             () => import('./stages/validation'),
    content_plan:           () => import('./stages/content_plan'),
    media_plan:             () => import('./stages/media_plan'),
}

export const runResearchStage = async (c: Context) => {
    const stageId = c.req.param('stageId') as StageId
    if (!(ALL_STAGE_IDS as readonly string[]).includes(stageId)) {
        return fail(c, `Unknown stageId: ${stageId}`, 400)
    }
    const instanceId = c.req.param('id')
    if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

    try {
        const mod = await STAGE_RUNNERS[stageId]()
        return await mod.run(c)
    } catch (err) {
        console.error(`runResearchStage(${stageId}) error:`, err)
        return fail(c, `Stage ${stageId} failed: ${(err as Error).message}`, 500)
    }
}

// Lightweight status read — for polling without re-running.
export const getResearchStageStatus = async (c: Context) => {
    try {
        const stageId = c.req.param('stageId') as StageId
        if (!(ALL_STAGE_IDS as readonly string[]).includes(stageId)) {
            return fail(c, `Unknown stageId: ${stageId}`, 400)
        }
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)

        const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
        const rd = (inst?.researchData as ResearchDataV2 | null) || {}
        return ok(c, {
            stageId,
            status: rd.plan?.status?.[stageId] || { state: 'pending' },
            hasResult: !!rd.results?.[stageId],
        })
    } catch (err) {
        console.error('getResearchStageStatus error:', err)
        return fail(c, 'Failed to read stage status', 500)
    }
}