/**
 * Phase 2026.01 — Cross-stage consistency HARD validator.
 *
 * Runs after Stage 10 (validation). Parses validation.extras.confidence_score
 * .strategy_changes[] for JSON-pointer-style `field` references targeting
 * upstream stages. For each, checks whether the current value in upstream
 * matches validation's recommended `to:` value.
 *
 * If diverged → flag in research_data.unresolved_validation_patches[].
 * Downstream stages (content_plan, monthly_plan) CHECK this list and
 * refuse to run until resolved.
 *
 * This is the systemic fix for the "Itai WTP" class of bug — validation
 * found Itai's actual WTP is ₪0-80 but persona DB stayed at ₪90-180. The
 * inconsistency leaked into strategy + downstream plans.
 *
 * Memory: [[schema-not-equal-strategy]] [[feedback-research-data-dual-write]]
 */

type Record_ = Record<string, unknown>

export interface UnresolvedPatch {
    field: string                          // JSON pointer to upstream stage field
    from_value: unknown                    // what validation said current is
    expected_to_value: unknown             // what validation recommends
    actual_current_value: unknown          // what we read in upstream now
    diverged: boolean                      // true if current != expected_to
    impact: 'high' | 'medium' | 'low'
    owner: string
    rationale_he: string
    evidence_records: string[]
    flagged_at: string
}

const PATCHABLE_STAGE_PREFIXES = [
    'audience_personas.',
    'positioning.',
    'strategy_options.',
    'seo_keyword_research.',
    'cost_timeline_modeling.',
] as const

function pickStrategyChanges(rd: Record_): Record_[] {
    const results = (rd.results as Record<string, Record_> | undefined) || {}
    const validation = results.validation
    if (!validation) return []
    const extras = (validation.extras as Record_ | undefined) || {}
    const cs = (extras.confidence_score as Record_ | undefined) || {}
    const changes = cs.strategy_changes
    return Array.isArray(changes) ? (changes as Record_[]) : []
}

/**
 * Resolve a JSON-pointer-like path within research_data.
 * Supports: dot notation, [N] array index, .results.<stage>.records[N]...
 * Returns undefined if any segment missing.
 */
function resolvePath(rd: Record_, path: string): unknown {
    // Normalize: strategy_options.records[0].first_win_channel.specific_action
    //   → ['results', 'strategy_options', 'records', 0, 'first_win_channel', 'specific_action']
    // The first segment may already be a stage id (audience_personas / strategy_options / ...)
    // Prepend 'results' if so.
    const firstSeg = path.split(/[.[]/)[0]
    const stageIds = ['audience_personas', 'positioning', 'strategy_options', 'seo_keyword_research', 'cost_timeline_modeling', 'competitor_landscape', 'internal_seo_audit', 'aeo_visibility', 'link_audit', 'validation']
    const prefixed = stageIds.includes(firstSeg) ? `results.${path}` : path

    // Tokenize: split by . and [, drop empty strings, parse array indices to numbers
    const tokens: Array<string | number> = []
    const regex = /([^.[\]]+)|\[(\d+)\]/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(prefixed)) !== null) {
        if (m[1] !== undefined) tokens.push(m[1])
        else if (m[2] !== undefined) tokens.push(Number(m[2]))
    }

    let cur: unknown = rd
    for (const t of tokens) {
        if (cur === undefined || cur === null) return undefined
        if (typeof t === 'number') {
            if (!Array.isArray(cur)) return undefined
            cur = (cur as unknown[])[t]
        } else {
            if (typeof cur !== 'object') return undefined
            cur = (cur as Record_)[t]
        }
    }
    return cur
}

function normalizeForCompare(v: unknown): string {
    if (v === undefined || v === null) return ''
    if (typeof v === 'string') return v.trim().toLowerCase()
    return JSON.stringify(v).toLowerCase()
}

/**
 * Check ONE strategy_change against current research_data state.
 * Returns true if values diverged (i.e. upstream stage hasn't been
 * patched to match validation recommendation).
 */
/**
 * The strategy_options.records[] index the user actually committed
 * (rd.chosenScenario.scenario → matching record). Used to ignore validation
 * patches that target a scenario the user did NOT pick — otherwise switching
 * smart↔aggressive leaves the old scenario's patches blocking forever.
 */
function chosenScenarioIndex(rd: Record_): number | null {
    const chosen = (rd.chosenScenario as { scenario?: string } | undefined)?.scenario
    if (!chosen) return null
    const recs = ((rd.results as Record<string, { records?: Array<{ scenario?: string }> }> | undefined) || {})
        .strategy_options?.records
    if (!Array.isArray(recs)) return null
    const idx = recs.findIndex(r => r?.scenario === chosen)
    return idx >= 0 ? idx : null
}

function detectDivergence(change: Record_, rd: Record_): UnresolvedPatch | null {
    const field = String(change.field || '')
    if (!field) return null

    // Only process changes targeting patchable upstream stages.
    const inScope = PATCHABLE_STAGE_PREFIXES.some(p => field.startsWith(p))
    if (!inScope) return null

    // Ignore patches targeting a strategy_options scenario record the user did
    // NOT choose. The validation stage scores both scenarios (smart +
    // aggressive); only the committed one gates downstream. Without this, a
    // patch for records[0] (smart) keeps freezing content_plan / monthly_plan
    // even after the user switched to records[1] (aggressive).
    const recIdxMatch = field.match(/strategy_options\.records\[(\d+)\]/)
    if (recIdxMatch) {
        const patchIdx = Number(recIdxMatch[1])
        const chosenIdx = chosenScenarioIndex(rd)
        if (chosenIdx !== null && patchIdx !== chosenIdx) return null
    }

    const actualCurrent = resolvePath(rd, field)
    const expectedTo = change.to

    // If `from:` exists and equals actualCurrent → user hasn't applied the patch.
    // If actualCurrent matches `to:` → user applied it (or LLM regenerated to align).
    const aNorm = normalizeForCompare(actualCurrent)
    const fromNorm = normalizeForCompare(change.from)
    const toNorm = normalizeForCompare(expectedTo)

    // Heuristic for divergence: current value contains substring of `from`
    // OR doesn't contain any substring of `to`. Strict equality is too brittle
    // for free-text fields. We do a loose containment match: actualCurrent
    // still looks like `from` AND doesn't look like `to` → diverged.
    const actualLooksLikeFrom = fromNorm.length > 0 && aNorm.includes(fromNorm.substring(0, Math.min(40, fromNorm.length)))
    const actualLooksLikeTo = toNorm.length > 0 && aNorm.includes(toNorm.substring(0, Math.min(40, toNorm.length)))

    const diverged = actualLooksLikeFrom && !actualLooksLikeTo

    return {
        field,
        from_value: change.from,
        expected_to_value: expectedTo,
        actual_current_value: actualCurrent,
        diverged,
        impact: (change.impact as 'high' | 'medium' | 'low' | undefined) || 'medium',
        owner: String(change.owner || 'founder'),
        rationale_he: String(change.rationale_he || ''),
        evidence_records: Array.isArray(change.evidence_records) ? (change.evidence_records as string[]) : [],
        flagged_at: new Date().toISOString(),
    }
}

/**
 * Compute unresolved patches across all strategy_changes for an instance.
 * Run this after validation stage completes. Persists result in
 * research_data.unresolved_validation_patches[].
 */
export function computeUnresolvedPatches(rd: Record_): UnresolvedPatch[] {
    const changes = pickStrategyChanges(rd)
    const patches: UnresolvedPatch[] = []
    for (const change of changes) {
        const result = detectDivergence(change, rd)
        if (result) patches.push(result)
    }
    return patches
}

/**
 * Block check: should downstream stages (content_plan / monthly_plan
 * generation) refuse to run because of unresolved high-impact patches?
 *
 * Policy: ANY high-impact diverged patch blocks. Medium-impact warns
 * but doesn't block. Low-impact informational only.
 */
export function shouldBlockDownstream(rd: Record_): { blocked: boolean; reason_he?: string; patches: UnresolvedPatch[] } {
    const unresolved = computeUnresolvedPatches(rd).filter(p => p.diverged)
    const highImpactDiverged = unresolved.filter(p => p.impact === 'high')
    if (highImpactDiverged.length === 0) {
        return { blocked: false, patches: unresolved }
    }
    const fieldsList = highImpactDiverged.map(p => p.field).join(', ')
    return {
        blocked: true,
        reason_he: `Stage 10 validation זיהתה ${highImpactDiverged.length} פערים high-impact בupstream שלא תוקנו: ${fieldsList}. תוכנית התוכן והתוכנית החודשית מוקפאות עד תיקון. הריצו מחדש את ה-stages הרלוונטיים עם feedback או צרו validation_patches.`,
        patches: unresolved,
    }
}