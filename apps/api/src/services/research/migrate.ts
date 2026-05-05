/**
 * One-shot research-data migration: legacy `stage1..stage5` flat fields →
 * new `intent + plan + results` shape per docs/research-pipeline-design.md §10.
 *
 * Idempotency: instances with `researchData.intent` already set are skipped.
 * Safety: preserved fields (chosenScenario, paidProfile, mediaPlan,
 *         contentPlan, mazhirAudit) are passed through untouched — these
 *         are the keys downstream consumers (Mazhir, Brand-Deep, etc) read.
 * Cleanup: legacy stage1..stage5 keys are STRIPPED after copying. Sergei's
 *          rule "no leftover trash in the system."
 *
 * Called once on app boot from app.ts. The reader.ts compatibility layer
 * keeps consumers working during the brief window between boot and
 * Phase 2-3 consumer rewrites.
 */

import { db } from '@/db'
import { instances } from '@/db/schema'
import { isNull, ne, or, and } from 'drizzle-orm'
import { detectIntent, planForIntent } from './planResolver'
import type { ResearchDataV2, StageId, StageResult, ResearchPlan } from './types'

const LEGACY_TO_MODERN: Array<[legacyKey: string, modern: StageId]> = [
    ['stage1', 'competitor_landscape'],
    ['stage2', 'seo_keyword_research'],
    ['stage3', 'audience_personas'],
    ['stage4', 'strategy_options'],
    ['stage5', 'validation'],
]

/**
 * Migrate one row. Returns an action tag for logging.
 */
export function migrateResearchData(rd: ResearchDataV2 | null | undefined): {
    next: ResearchDataV2 | null
    action: 'skipped_no_data' | 'skipped_already_migrated' | 'migrated'
} {
    if (!rd) return { next: null, action: 'skipped_no_data' }
    if (rd.intent && rd.plan) return { next: rd, action: 'skipped_already_migrated' }

    const detectedIntent = detectIntent(rd.answers)
    const plannedStages = planForIntent(detectedIntent)

    const results: Partial<Record<StageId, StageResult>> = {}
    const status: ResearchPlan['status'] = {}

    for (const [legacyKey, modernId] of LEGACY_TO_MODERN) {
        const legacyContent = (rd as any)[legacyKey]
        if (typeof legacyContent === 'string' && legacyContent.length > 0) {
            const legacyAt = (rd as any)[`${legacyKey}GeneratedAt`]
            results[modernId] = {
                content: legacyContent,
                source: 'legacy_migration',
                runAt: typeof legacyAt === 'string' ? legacyAt : new Date().toISOString(),
                integrationsUsed: ['legacy'],
            }
            status[modernId] = { state: 'completed', runAt: typeof legacyAt === 'string' ? legacyAt : undefined }
        }
    }

    // Pending status for stages in the plan that weren't run yet.
    for (const stageId of plannedStages) {
        if (!status[stageId]) status[stageId] = { state: 'pending' }
    }

    // Build the migrated shape — copy preserved fields explicitly, drop legacy.
    const next: ResearchDataV2 = {
        answers: rd.answers,
        intent: detectedIntent,
        plan: { stages: plannedStages, status },
        results,
        // Strategy outputs — flat, downstream-consumed, kept verbatim:
        chosenScenario: rd.chosenScenario,
        chosenScenarioAt: rd.chosenScenarioAt,
        paidProfile: rd.paidProfile,
        mediaPlan: rd.mediaPlan,
        contentPlan: rd.contentPlan,
        mazhirAudit: rd.mazhirAudit,
        brandPhaseAt: rd.brandPhaseAt,
        archivedPlans: rd.archivedPlans,
        generatedAt: rd.generatedAt,
        // Legacy stage1..stage5 fields are intentionally NOT copied.
        // Reader.ts compatibility layer covers the brief window where some
        // consumers might still expect them; new shape is canonical.
    }

    // Strip undefined leaves so the JSONB stays clean.
    for (const k of Object.keys(next) as (keyof ResearchDataV2)[]) {
        if (next[k] === undefined) delete (next as any)[k]
    }

    return { next, action: 'migrated' }
}

/**
 * Boot-time migration runner. Iterates every instance with non-null
 * researchData and applies migrateResearchData. Logs counts per action.
 *
 * Idempotent: re-running the runner on already-migrated rows is a no-op.
 */
export async function runResearchDataMigration(): Promise<{
    total: number; migrated: number; alreadyMigrated: number; skipped: number
}> {
    const stats = { total: 0, migrated: 0, alreadyMigrated: 0, skipped: 0 }

    // Pull every row with non-null researchData. Most production rows have
    // it. Limited universe (handful of instances), no need for batching.
    const rows = await db.select().from(instances).where(
        and(
            // researchData IS NOT NULL — JSON value, not column. We check via SQL
            // by selecting all and filtering in code; safer than ::jsonb compare.
            or(ne(instances.id, ''), isNull(instances.id) /* always-true filler so where() compiles */),
        ),
    )

    for (const row of rows) {
        stats.total++
        const rd = row.researchData as ResearchDataV2 | null
        const { next, action } = migrateResearchData(rd)
        if (action === 'skipped_no_data') { stats.skipped++; continue }
        if (action === 'skipped_already_migrated') { stats.alreadyMigrated++; continue }
        if (next) {
            await db.update(instances)
                .set({ researchData: next as never })
                .where((await import('drizzle-orm')).eq(instances.id, row.id))
            stats.migrated++
        }
    }

    console.log(`[researchDataMigration] total=${stats.total}, migrated=${stats.migrated}, alreadyMigrated=${stats.alreadyMigrated}, skipped=${stats.skipped}`)
    return stats
}