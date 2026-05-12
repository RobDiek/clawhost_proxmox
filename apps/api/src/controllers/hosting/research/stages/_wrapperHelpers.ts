/**
 * Shared helpers for intent-wrapper stages (paid_audit, content_plan,
 * media_plan). These stages don't run a fresh agent — they delegate to an
 * existing service and surface its result through the unified plan.status
 * surface so the pipeline widget shows "completed".
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import type { ResearchDataV2, StageId, StageStatus, StageResult } from '@/services/research/types'

/**
 * Mark a stage completed in plan.status + write a small result marker into
 * rd.results[stageId]. Underlying data (mazhirAudit / mediaPlan / contentPlan)
 * keeps living in its own top-level rd key — we don't duplicate it. The
 * marker exists so plan.status renders consistently and provenance is logged.
 */
export async function markWrapperStageCompleted(args: {
    instanceId: string
    stageId: StageId
    summaryMd: string
    integrationsUsed: string[]
    agentId?: string
    /**
     * Phase 4.0(fix13) — wrapper stages (content_plan, media_plan,
     * paid_audit) historically kept their data in legacy top-level
     * research_data keys (rd.contentPlan, rd.mediaPlan, rd.mazhirAudit)
     * and wrote ONLY a summary blurb to results[stageId]. That hid the
     * data from the unified pipeline UI which reads
     * results[stageId].records[] to render per-stage panels.
     *
     * Wrapper callers now pass `records` + optional `extras` so the
     * results marker mirrors the same shape as research stages. The
     * legacy top-level key stays (for backward compat with calendar/
     * media-plan widgets that already read from there).
     */
    records?: unknown[]
    extras?: Record<string, unknown>
    confidence?: 'high' | 'medium' | 'working_hypothesis'
}): Promise<void> {
    const { instanceId, stageId, summaryMd, integrationsUsed, agentId, records, extras, confidence } = args
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error(`markWrapperStageCompleted: instance ${instanceId} not found`)

    const { resolveAgentById, resolvePrimaryAgent, readResearchData, writeResearchData } =
        await import('@/services/agentContext')
    const agent = agentId
        ? await resolveAgentById(instanceId, agentId)
        : await resolvePrimaryAgent(instanceId)
    const rd = (await readResearchData(agent, instanceId)) as unknown as ResearchDataV2
    const results = ((rd.results as Record<string, StageResult>) || {})
    const plan = (rd.plan as { stages?: StageId[]; status?: Record<StageId, StageStatus> } | undefined) || {}
    const status: Record<StageId, StageStatus> = { ...(plan.status || {}) } as Record<StageId, StageStatus>

    const runAt = new Date().toISOString()
    results[stageId] = {
        content: summaryMd,
        source: 'mixed',
        runAt,
        integrationsUsed,
        ...(records ? { records } : {}),
        ...(extras ? { extras } : {}),
        ...(confidence ? { confidence } : {}),
    }
    status[stageId] = { state: 'completed', runAt }

    await writeResearchData(agent, instanceId, {
        ...rd,
        results,
        plan: { ...plan, status },
    } as unknown as Record<string, unknown>)
}