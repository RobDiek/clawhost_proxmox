/**
 * Phase 2026.02 Block 6 — Paid pipeline hard cross-stage validators.
 *
 * Soft validators (contentQuality.ts) emit warnings without blocking.
 * These hard validators BLOCK downstream stages from running when paid
 * pipeline output violates senior-bar rules per playbook §7.
 *
 * Persists violations to `research_data.unresolved_paid_validation[]`.
 * computeUnresolvedPaidPatches() inspects results and returns the list
 * of patches that must be resolved before next stage proceeds.
 */

import type { ResearchDataV2, StageId } from '../types'

export interface PaidValidationPatch {
    /** Stage that failed validation. */
    stageId: StageId
    /** Stable code for tooling (matches playbook §7.X). */
    code: string
    severity: 'block' | 'warn'
    title_he: string
    detail_he: string
    /** Resolved when re-running the cited stage with patched output. */
    must_rerun_stage?: StageId
    detected_at: string
}

type Rec = Record<string, unknown>

/**
 * Check paid_audit verdict matches the deterministic §5.1 logic.
 * Block downstream if violation found.
 */
export function checkVerdictMatchesScores(rd: ResearchDataV2): PaidValidationPatch[] {
    const out: PaidValidationPatch[] = []
    const results = (rd?.results as Record<string, Rec | undefined> | undefined) || {}
    const audit = results.paid_audit
    if (!audit) return out
    const extras = (audit.extras as Rec | undefined) || {}
    const verdict = String(extras.verdict || '')
    const records = (audit.records as Rec[] | undefined) || []
    const measurementRec = records.find(r => String(r.dimension).toLowerCase() === 'measurement')
    const measScore = typeof measurementRec?.score_0_100 === 'number'
        ? measurementRec.score_0_100 : parseInt(String(measurementRec?.score_0_100), 10)
    const totalScore = typeof extras.total_score_0_100 === 'number'
        ? extras.total_score_0_100 : parseInt(String(extras.total_score_0_100 ?? ''), 10)

    // §4.4.4 hard rule: measurement < 30 → fix_tracking_first MUST be verdict
    if (Number.isFinite(measScore) && (measScore as number) < 30 && verdict !== 'fix_tracking_first') {
        out.push({
            stageId: 'paid_audit',
            code: 'verdict_must_match_scores_measurement_low',
            severity: 'block',
            title_he: 'verdict לא תואם — measurement < 30 אבל verdict ≠ fix_tracking_first',
            detail_he: `Playbook §4.4.4: measurement_score=${measScore} < 30 → verdict חובה fix_tracking_first. ` +
                `התקבל "${verdict}". Smart Bidding על סיגנל מזוהם = wasted budget. ` +
                'הריצו את paid_audit מחדש עם verdict=fix_tracking_first.',
            must_rerun_stage: 'paid_audit',
            detected_at: new Date().toISOString(),
        })
    }

    return out
}

/**
 * §7.3 — if verdict=fix_tracking_first, action_plan.changes MUST be measurement-only.
 * No bidding strategy changes, no budget changes.
 */
export function checkTrackingFirstNoBiddingChanges(rd: ResearchDataV2): PaidValidationPatch[] {
    const out: PaidValidationPatch[] = []
    const results = (rd?.results as Record<string, Rec | undefined> | undefined) || {}
    const audit = results.paid_audit
    if (!audit) return out
    const extras = (audit.extras as Rec | undefined) || {}
    if (extras.verdict !== 'fix_tracking_first') return out

    const actionPlan = extras.action_plan as { changes?: unknown[] } | undefined
    const changes = (actionPlan?.changes as Rec[] | undefined) || []

    // Tokens that indicate a bidding/budget change (not allowed under fix_tracking_first)
    const BIDDING_TOKENS = /tcpa|troas|target_cpa|target_roas|max[_ ]conv|smart[_ ]bidding|אסטרטגיית[ ]ביידינג|הצעות[ ]חכמות|הצעת[ ]מחיר|bid[ ]strategy|budget|תקציב/i

    for (const ch of changes) {
        const txt = `${ch.change_he || ''} ${ch.change_en || ''}`.toLowerCase()
        if (BIDDING_TOKENS.test(txt)) {
            out.push({
                stageId: 'paid_audit',
                code: 'tracking_first_bidding_change_present',
                severity: 'block',
                title_he: 'fix_tracking_first אבל יש שינוי bidding/budget ב-action_plan',
                detail_he: `Playbook §7.3: verdict=fix_tracking_first אוסר שינויי bidding/budget. ` +
                    `התקבל change: "${String(ch.change_he || ch.change_en).substring(0, 100)}". ` +
                    'הריצו paid_audit מחדש — fix_tracking_first מתיר רק תיקוני מעקב (GTM tags / Conv Linker / Enhanced Conv / Consent Mode).',
                must_rerun_stage: 'paid_audit',
                detected_at: new Date().toISOString(),
            })
            break  // one block patch per stage is enough
        }
    }
    return out
}

/**
 * §7.5 — tier mismatch with bid strategy. T1 cannot use tCPA / Max Conv Value /
 * Max Conversions on production traffic.
 */
export function checkTierMatchesBidStrategy(rd: ResearchDataV2): PaidValidationPatch[] {
    const out: PaidValidationPatch[] = []
    const results = (rd?.results as Record<string, Rec | undefined> | undefined) || {}
    const inv = results.paid_data_inventory
    const kwRes = results.paid_keyword_research
    if (!inv || !kwRes) return out
    const tier = String(((inv.extras as Rec | undefined)?.tier ?? '')).toUpperCase()
    if (!tier) return out

    const TIER_RANK: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 }
    const minTierForStrategy: Record<string, number> = {
        manual_cpc: 0,
        enhanced_cpc: 0,
        max_clicks: 0,
        max_conversions: 2,
        target_cpa: 3,
        target_roas: 4,
        max_conversion_value: 3,
    }

    const adGroups = (kwRes.records as Rec[] | undefined) || []
    for (const ag of adGroups) {
        const strat = String(ag.bid_strategy_recommended || '').toLowerCase()
        const blocked = ag.bid_strategy_blocked_until_tracking_fix === true
        if (blocked) continue  // explicitly gated; ok
        const required = minTierForStrategy[strat]
        if (required !== undefined && TIER_RANK[tier] !== undefined && TIER_RANK[tier] < required) {
            out.push({
                stageId: 'paid_keyword_research',
                code: 'tier_below_required_for_bid_strategy',
                severity: 'block',
                title_he: `tier ${tier} לא תומך ב-${strat}`,
                detail_he: `Playbook §2 + §7.5: ad group "${ag.ad_group_id || '?'}" מציע ${strat} אבל החשבון ב-tier ${tier}. ` +
                    `דרוש מינימום T${required}. הריצו paid_keyword_research מחדש או שדרגו את ה-tier.`,
                must_rerun_stage: 'paid_keyword_research',
                detected_at: new Date().toISOString(),
            })
        }
    }
    return out
}

/** Run all hard checks. Returns list of patches that need user resolution. */
export function computeUnresolvedPaidPatches(rd: ResearchDataV2): PaidValidationPatch[] {
    return [
        ...checkVerdictMatchesScores(rd),
        ...checkTrackingFirstNoBiddingChanges(rd),
        ...checkTierMatchesBidStrategy(rd),
    ]
}

/** Convenience predicate for downstream stage controllers. */
export function shouldBlockDownstreamPaid(rd: ResearchDataV2, downstreamStage: StageId): boolean {
    const patches = computeUnresolvedPaidPatches(rd)
    if (patches.length === 0) return false
    // Only block stages downstream of paid_audit's logical position.
    const blockBy: Record<StageId, Set<StageId>> = {
        // any downstream of paid_audit / paid_keyword_research
        paid_budget_scenarios: new Set(['paid_audit', 'paid_keyword_research']),
        strategy_options: new Set(['paid_audit', 'paid_keyword_research']),
        media_plan: new Set(['paid_audit', 'paid_keyword_research']),
    } as Record<StageId, Set<StageId>>
    const sources = blockBy[downstreamStage]
    if (!sources) return false
    return patches.some(p => p.severity === 'block' && sources.has(p.stageId))
}