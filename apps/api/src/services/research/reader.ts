/**
 * Compatibility reader — resolves stage results from either the new
 * `results.<stage_id>` namespace OR the legacy `stage1..stage5` fields.
 *
 * Phase 1 ships this so existing consumers keep working while we migrate
 * them in Phase 2-3 to read through this helper. Phase 7 cleanup deletes
 * the legacy fallback branches.
 *
 * Rule: NEW code reads via `getStageResult(rd, stageId)`. NEW code
 * NEVER reads `rd.stage1..stage5` directly — those keys are wiped by
 * the migration script and won't exist on fresh instances.
 */

import type { ResearchDataV2, StageId, StageResult } from './types'

// Legacy stage1..stage5 → new stage IDs.
// Mapping is best-effort: legacy stage1 was generic competitor research,
// which we now split into competitor_landscape (always) + seo_keyword_research
// (SEO intent). Migration places the legacy stage1 content into
// competitor_landscape (the closer match for generic competitor analysis).
const LEGACY_STAGE_MAP: Partial<Record<StageId, 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5'>> = {
    competitor_landscape: 'stage1',
    seo_keyword_research: 'stage2',
    audience_personas:    'stage3',
    strategy_options:     'stage4',
    validation:           'stage5',
}

/**
 * Get the result content for a stage. Returns null when the stage hasn't
 * been run on this instance (neither in new shape nor legacy).
 */
export function getStageResult(rd: ResearchDataV2 | null | undefined, stageId: StageId): StageResult | null {
    if (!rd) return null

    // Modern path — preferred.
    const modern = rd.results?.[stageId]
    if (modern && modern.content) return modern

    // Legacy fallback — synthesize a StageResult on the fly so consumers
    // get a consistent shape. Marked `source: 'legacy_migration'` so any
    // provenance UI surfaces it as imported-from-old-schema.
    const legacyKey = LEGACY_STAGE_MAP[stageId]
    if (legacyKey) {
        const legacyContent = rd[legacyKey]
        if (typeof legacyContent === 'string' && legacyContent.length > 0) {
            const legacyAt = rd[`${legacyKey}GeneratedAt` as keyof ResearchDataV2] as string | undefined
            return {
                content: legacyContent,
                source: 'legacy_migration',
                runAt: legacyAt || new Date().toISOString(),
                integrationsUsed: ['legacy'],
            }
        }
    }
    return null
}

/**
 * Convenience: just the markdown body. Returns empty string if missing,
 * matching the way most legacy consumers used `rd.stage1 || ''`.
 */
export function getStageContent(rd: ResearchDataV2 | null | undefined, stageId: StageId): string {
    return getStageResult(rd, stageId)?.content ?? ''
}

/** True when the stage is completed (modern or legacy). */
export function hasStageRun(rd: ResearchDataV2 | null | undefined, stageId: StageId): boolean {
    return !!getStageResult(rd, stageId)
}