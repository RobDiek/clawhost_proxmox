/**
 * Stage dependency graph — computed over STAGE_CATALOG.upstream.
 *
 * Each stage declares its `upstream: StageId[]`. The downstream traversal
 * computes the reverse: "if stage X re-runs, which stages become stale?".
 *
 * Plus: wrapper artifacts (mazhirAudit, mediaPlan, contentPlan,
 * marketingIntents, brandBook semantic fields) are not stages but live
 * downstream of specific stages. The `WRAPPER_INVALIDATION_MAP` records
 * "when stage X re-runs, also invalidate wrappers Y[]".
 */

import { STAGE_CATALOG, ALL_STAGE_IDS, type StageId } from './types'

/** Wrapper-artifact keys that live OUTSIDE the stage results[] but depend on stage outputs. */
export type WrapperArtifact =
    | 'mazhirAudit'        // produced by paid_audit
    | 'mediaPlan'          // produced by media_plan
    | 'contentPlan'        // produced by content_plan
    | 'chosenScenario'     // produced by strategy_options + scenarioPicker
    | 'marketingIntents'   // implied by strategy_options
    | 'brandSemanticFields' // positioning fields, voice archetype, personas

/**
 * Reverse dependency map: stageId → wrapper artifacts that go stale when it
 * re-runs. Centralized here so when we add new wrappers we only touch this
 * map (not every stage file).
 */
export const WRAPPER_INVALIDATION_MAP: Record<string, WrapperArtifact[]> = {
    paid_audit: ['mazhirAudit', 'mediaPlan'],
    media_plan: ['mediaPlan'],
    content_plan: ['contentPlan'],
    strategy_options: ['chosenScenario', 'marketingIntents', 'mediaPlan', 'contentPlan'],
    positioning: ['brandSemanticFields'],
    audience_personas: ['brandSemanticFields'],
    competitor_landscape: ['brandSemanticFields'],  // archetype/voice consume competitor framing
}

/**
 * Compute direct children: stages whose `upstream` includes the given stage.
 * O(N) over the catalog; N=19, fine.
 */
export function getDirectDownstream(stageId: StageId): StageId[] {
    const out: StageId[] = []
    for (const id of ALL_STAGE_IDS) {
        const desc = STAGE_CATALOG[id]
        if (desc.upstream.includes(stageId)) out.push(id)
    }
    return out
}

/**
 * Transitive downstream — every stage reachable from `stageId` via the
 * downstream-direction edges. Used to compute the full invalidation set
 * before a re-run.
 *
 * Topological order: deepest dependent first. Caller can reverse if it
 * wants to mark stale starting from the root.
 */
export function getTransitiveDownstream(stageId: StageId): StageId[] {
    const seen = new Set<StageId>()
    const order: StageId[] = []
    function walk(curr: StageId) {
        for (const child of getDirectDownstream(curr)) {
            if (seen.has(child)) continue
            seen.add(child)
            walk(child)
            order.push(child)
        }
    }
    walk(stageId)
    return order
}

/**
 * Full invalidation report for a re-run of `stageId`:
 * - Downstream stages (transitive) that will go stale
 * - Wrapper artifacts that will go stale
 *
 * Returned shape is what both the GET /stage-impact endpoint and the
 * cascade-stale write path consume.
 */
export interface StageImpactReport {
    stageId: StageId
    downstreamStages: StageId[]            // transitive
    wrapperArtifacts: WrapperArtifact[]    // direct + via transitive stages
}

export function computeStageImpact(stageId: StageId): StageImpactReport {
    const downstreamStages = getTransitiveDownstream(stageId)
    const wrapperSet = new Set<WrapperArtifact>()
    // Direct wrappers of the stage itself
    for (const w of WRAPPER_INVALIDATION_MAP[stageId] || []) wrapperSet.add(w)
    // Wrappers attached to each downstream stage
    for (const ds of downstreamStages) {
        for (const w of WRAPPER_INVALIDATION_MAP[ds] || []) wrapperSet.add(w)
    }
    return {
        stageId,
        downstreamStages,
        wrapperArtifacts: Array.from(wrapperSet),
    }
}