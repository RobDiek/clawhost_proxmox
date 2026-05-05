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
}): Promise<void> {
    const { instanceId, stageId, summaryMd, integrationsUsed } = args
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error(`markWrapperStageCompleted: instance ${instanceId} not found`)

    const rd = (inst.researchData as ResearchDataV2 | null) || {}
    const results = ((rd.results as Record<string, StageResult>) || {})
    const plan = (rd.plan as { stages?: StageId[]; status?: Record<StageId, StageStatus> } | undefined) || {}
    const status: Record<StageId, StageStatus> = { ...(plan.status || {}) } as Record<StageId, StageStatus>

    const runAt = new Date().toISOString()
    results[stageId] = {
        content: summaryMd,
        source: 'mixed',
        runAt,
        integrationsUsed,
    }
    status[stageId] = { state: 'completed', runAt }

    await db.update(instances).set({
        researchData: {
            ...rd,
            results,
            plan: { ...plan, status },
        } as never,
    }).where(eq(instances.id, instanceId))
}