/**
 * Hypothesis Engine — types + canonical codes.
 *
 * A hypothesis is a structured, dated, testable claim about a paid-track
 * account, attached to a specific action. Generators produce them; lifecycle
 * advances them; persist writes them; resolver evaluates them.
 *
 * Each hypothesis_code below is stable and used for dedup — a generator
 * cannot propose the same (code, scope) while a previous one is still open.
 */

import type { Platform } from '../dataIngestion/types'

// ─── Canonical hypothesis codes ───────────────────────────────────────────
// Naming convention: <topic>_<specific-claim>. Topic words map to the
// generator file in services/hypothesisEngine/generators/.
export type HypothesisCode =
    // bidding tier ladder transitions
    | 'bidding_tier_mismatch_max_clicks_to_max_conv'    // T2+ but still on Max Clicks
    | 'bidding_tier_mismatch_max_conv_to_tcpa'          // T2 with stable conv → tCPA candidate
    | 'bidding_tier_mismatch_tcpa_to_troas'             // T4 with value tracking → tROAS candidate
    | 'bidding_tier_demotion_smart_to_max_clicks'       // Smart Bidding starving (conv30d < 10), demote
    // outlier performance
    | 'outlier_underperformer'                          // bottom-decile campaign — pause/restructure
    | 'outlier_overperformer'                           // top-decile — increase budget / replicate
    // event/objective mismatch
    | 'conversion_event_mix_off_objective'              // marketing goal says leads, conversions are messaging
    | 'conversion_event_thin_signal'                    // event has <30 conv/30d → ineligible for tCPA
    // tracking gaps
    | 'tracking_gap_attribution_unknown'                // >30% rows missing attribution metadata
    | 'tracking_gap_no_conversion_event_name'           // rows have conversions but no event name
    | 'tracking_gap_currency_fx_stale'                  // FX rates stale, ROAS unreliable
    // CAPI / Conversions API (Meta)
    | 'tracking_gap_capi_not_configured'                // Meta active but no CAPI token → EMQ blind
    | 'tracking_gap_capi_low_quality'                   // CAPI present but events incomplete (low EMQ)
    // modeled vs observed conversions
    | 'tracking_data_quality_modeled_share'             // too high a share of conversions are inferred/modeled, not observed
    // Consent Mode v2 (EEA GDPR)
    | 'tracking_gap_consent_mode_v2_audit'              // EU exposure declared, CMv2 verification required
    | 'tracking_gap_consent_mode_v2_no_gtm'             // EU exposure but no GTM — CMv2 cannot be deployed
    // frequency saturation (Meta-specific)
    | 'frequency_saturation_meta'                       // freq > 4 + ROAS decline → audience fatigue
    // budget pacing
    | 'budget_pacing_front_loaded'                      // 80% spend in first 30% of period
    | 'budget_pacing_starved'                           // hit budget cap most days
    // cross-platform imbalance
    | 'cross_platform_cpa_imbalance'                    // Meta CPA 3x Google CPA → reallocation candidate (with caveats)
    // cross-platform truth (Phase 4.4)
    | 'cross_platform_truth_double_count_gap'           // platforms over-claim revenue vs observed (GA4/server)
    | 'cross_platform_truth_geo_experiment'             // attribution trust low → run a geo holdout to measure incrementality
    // LLM-driven (catch-all for opus audit findings that don't fit rule codes)
    | 'opus_audit_finding'

export type HypothesisStatus =
    | 'proposed'        // generator created it; user hasn't seen yet
    | 'approved'        // user clicked "yes do this"; awaiting execution / testing start
    | 'testing'         // execution complete (or instructions delivered); window in flight
    | 'validated'       // resolved: success criteria met
    | 'rejected'        // resolved: success criteria NOT met (the hypothesis was wrong)
    | 'inconclusive'    // resolved: not enough data to decide
    | 'expired'         // sat in 'proposed' too long; replaced by fresher analysis
    | 'superseded'      // newer hypothesis on same scope replaced it
    | 'declined'        // user explicitly said "no don't do this"

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type ImpactKind =
    | 'spend_reduction'
    | 'conv_uplift'
    | 'cpa_reduction'
    | 'roas_uplift'
    | 'risk_mitigation'

export type TestMethod =
    | 'before_after_window'    // 14/28d before vs after the action
    | 'ab_split'               // platform-level A/B
    | 'holdout'                // geo-holdout (Meta lift, Google geo experiments)
    | 'time_series_changepoint'  // CUSUM-style for noisy daily series

export interface TestSuccessCriteria {
    /** Metric to evaluate. */
    metric: 'cpa_ils' | 'roas' | 'cvr' | 'ctr' | 'spend_ils' | 'conversions' | 'frequency'
    /** Direction the metric must move. */
    direction: 'decrease' | 'increase' | 'no_worse_than'
    /** Required magnitude as percentage. e.g. 15 = 15% improvement. */
    thresholdPct?: number
    /** Absolute floor under which the test is inconclusive (not enough data). */
    minConv?: number
    minSpendIls?: number
    /** Statistical confidence required to call it. */
    pValueMax?: number
}

export interface ManualInstructionStep {
    step: number
    platformLabel: string                  // 'Meta Ads Manager' | 'Google Ads' | 'Google Tag Manager'
    actionLabel: string                    // English summary
    actionLabelHe: string                  // Hebrew, plural address per [[feedback_hebrew_plural]]
    /** Where in the UI: breadcrumb or screenshot pointer. */
    screenshotHint?: string
    /** How the user verifies they did it correctly. */
    verify?: string
    verifyHe?: string
}

export interface ApiActionRecipe {
    platform: Platform
    api: 'google_ads' | 'meta_marketing' | 'gtm' | 'ga4_admin'
    endpoint: string                       // logical name; e.g. 'campaigns.mutate.bidding_strategy'
    payload: Record<string, unknown>
    /** Endpoint to verify the change without executing (e.g. validate-only mode). */
    dryRunEndpoint?: string
    /** Per D5 directive: TRUE for any action touching live spend. */
    approvalRequired: boolean
    /** What we WON'T do without further approval. */
    guardrails: string[]
}

export interface EvidenceSnapshot {
    asOf: string                           // ISO timestamp
    metrics: Record<string, number | string | boolean | string[] | null>
    /** ingested_data_points row IDs whose aggregation produced these metrics. */
    rowIds?: number[]
    /** Window covered by the underlying rows. */
    window: { start: string; end: string }
    /** Source-quality summary. */
    qualitySummary?: {
        minScore: number
        flagsObserved: string[]
        attributionWindowsSeen: string[]
        eventsSeen: string[]
    }
}

/**
 * What a generator produces. Generators are pure functions: given context,
 * return zero-or-more hypothesis proposals. The orchestrator handles DB writes
 * + dedup + supersession.
 */
export interface HypothesisProposal {
    hypothesisCode: HypothesisCode
    title: string
    titleHe: string
    scopePlatform?: string
    scopeDataType?: string
    scopeEntityId?: string | null
    scopeEntityName?: string | null
    scopeEventName?: string | null
    scopeWindow: { start: string; end: string }

    observation: string
    observationHe: string
    hypothesis: string
    hypothesisHe: string
    reasoning: string
    reasoningHe: string

    severity: Severity
    confidence: number
    expectedImpactIls?: number
    expectedImpactKind?: ImpactKind
    expectedImpactWindowDays?: number

    evidenceSnapshot: EvidenceSnapshot
    evidenceQualityScore?: number

    proposedAction: string
    proposedActionHe: string
    manualInstructions?: ManualInstructionStep[]
    apiActionRecipe?: ApiActionRecipe

    testMethod?: TestMethod
    testWindowDays?: number
    testSuccessCriteria?: TestSuccessCriteria

    source: 'rule_engine' | 'opus_audit' | 'sonnet_pattern' | 'anomaly_detector' | 'user_proposed'
    generatedByModel?: string
}

/**
 * Context passed to every generator. Pre-loaded so generators don't each
 * query the DB and we keep them pure-ish (LLM generators still call out).
 */
export interface GeneratorContext {
    instanceId: string
    agentId?: string | null

    /** Output of paidDataInventory.runPaidDataInventory(). */
    inventory: {
        tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4'
        tierRationale: string
        perPlatform?: Array<{ platform: string; tier: string; spend90dIls: number; conv30d: number }>
        dominantPlatform?: string | null
        adapters: Array<{ id: string; connected: boolean; metadata?: Record<string, unknown> }>
    }

    /** Per-platform 90d aggregates from aggregateByPlatform. */
    platformAggregates: Array<{
        platform: string
        spendIls: number
        impressions: number
        clicks: number
        conversions: number
        conversionValueIls: number
        eventNames: string[]
        attributionWindows: string[]
        rows: number
    }>

    /** Per-platform × per-event breakdown. */
    eventBreakdown: Array<{
        platform: string
        eventName: string
        attributionWindow: string | null
        spendIls: number
        conversions: number
        conversionValueIls: number
        rows: number
    }>

    /** Marketing goals as the user declared in answers. */
    marketingGoals: string[]

    /** Source of truth: paidProfile from research_data. */
    paidProfile: Record<string, unknown>

    /**
     * Phase 4.4 — cross-platform truth layer (MER + aMER + per-platform trust).
     * Computed once per engine run and shared by all generators that need it.
     * `null` only when computation failed (rare); generators must defensively
     * skip rather than throw when this is null.
     */
    truth?: CrossPlatformTruthLite | null

    /** Now — pinned so generators in one run share a clock. */
    now: Date
}

/**
 * Minimal cross-platform truth surface for generators. Mirrors the full
 * `CrossPlatformTruth` from `services/crossPlatformTruth` but kept here
 * to avoid a cross-package import cycle (hypothesisEngine ⇄ crossPlatformTruth).
 */
export interface CrossPlatformTruthLite {
    mer: {
        windowDays: number
        spendTotalIls: number
        revenueClaimedIls: number
        revenueObservedIls: number | null
        revenueAcquisitionClaimedIls: number
        revenueAcquisitionObservedIls: number | null
        mer: number | null
        merObserved: number | null
        aMer: number | null
        aMerObserved: number | null
        doubleCountGapPct: number | null
        aMerGapPct: number | null
        platformBreakdown: Array<{
            platform: string
            spendIls: number
            revenueClaimedIls: number
            revenueAcquisitionIls: number
            roasClaimed: number
            share: number
        }>
        quality: {
            hasObservedChannel: boolean
            observedChannel: string | null
            paidPlatformsActive: number
            spendTotalIsZero: boolean
        }
    }
    trust: {
        perPlatform: Array<{
            platform: string
            tier: 'observed_server' | 'observed_browser' | 'modeled_platform' | 'inferred'
            tierRank: number
            tierLabelHe: string
            rationaleHe: string
            upgradeHintHe?: string
        }>
        compositeScore: number
        weakestPlatform: string | null
    }
}