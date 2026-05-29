/**
 * Deferred Actions Framework — Phase 2026.02 Block 6 K15
 *
 * Generic infrastructure for ANY temporary platform action that needs a
 * scheduled follow-up reminder + clean restore path. Solves the "I did X
 * temporarily, system should remind me later" problem systemically.
 *
 * Examples of deferred actions:
 *   - bidding_strategy        — Conservative/Moderate/Aggressive Smart Bidding switch
 *   - plugin_tracking_disable — disabled PYS Ads tracking, want reminder if re-enable
 *   - campaign_pause          — paused campaigns during incident
 *   - ga4_setting_change      — changed GA4 setting temporarily
 *   - manual_event_override   — manually marked / unmarked Key Event
 *   - budget_increase         — bumped budget for sale period, revert after
 *
 * Each action kind registers a handler with the registry. Scheduler runs
 * across all kinds uniformly.
 */

export type DeferredActionKind =
    | 'bidding_strategy'
    | 'plugin_tracking_disable'
    | 'campaign_pause'
    | 'ga4_setting_change'
    | 'manual_event_override'
    | 'budget_increase'

export type DeferredActionState =
    | 'active'                 // recently applied, recovery window not yet elapsed
    | 'followup_generated'     // recovery window passed, monthly_task created in dashboard
    | 'restored'               // user clicked Restore, applied successfully
    | 'dismissed'              // user explicitly dismissed (won't restore)
    | 'expired'                // too old to act on (e.g. 60+ days after recoveryDays elapsed)

export interface DeferredAction<TPayload = unknown> {
    id: string                          // {kind_prefix}_{timestamp}_{rand}
    kind: DeferredActionKind
    appliedAt: string                   // ISO timestamp
    appliedBy: string                   // user id
    recoveryDays: number                // how many days until follow-up
    payload: TPayload                   // kind-specific data (typed via handler)
    state: DeferredActionState

    followupGeneratedAt: string | null
    restoredAt: string | null
    dismissedAt: string | null
    dismissReason?: string

    // Set by handler's validateBeforeRestore() if it wants to defer rather
    // than generate follow-up immediately (e.g. signal still polluted)
    deferUntil?: string | null
    deferReason?: string
    deferCount?: number                 // increments each time defer fires
}

export interface RestoreResult {
    ok: boolean
    actionsApplied: Array<{ resourceId: string; change: string }>
    errors: Array<{ resourceId: string; error: string }>
    summary: string
}

export interface ValidationResult {
    decision: 'proceed' | 'defer'
    deferDays?: number
    reason?: string
}

export interface DashboardDescriptor {
    titleHe: string
    subtitleHe: string
    daysRemaining: number               // negative if already past recovery window
    severity: 'info' | 'warning' | 'critical'
    icon: string                        // emoji
}

export interface FollowupTaskDescriptor {
    taskId: string
    outputId: string
    titleHe: string
    summaryHe: string
    priority: 'P0' | 'P1' | 'P2'
    actionPlan: Array<{ step: string; automated: boolean; estimatedMinutes: number }>
    expectedImpact: {
        metric: string
        value: number
        horizon: 'immediate' | 'short' | 'medium' | 'long'
        rationaleHe: string
        confidence: 'high' | 'medium' | 'low'
    }
    metadata: Record<string, unknown>
}

/**
 * Handler contract — each deferred action kind implements this.
 * Registered into the framework via registerHandler() at module load.
 */
export interface DeferredActionHandler<TPayload = unknown> {
    kind: DeferredActionKind

    /** Build the monthly_task that will surface in the dashboard when the recovery window elapses. */
    buildFollowupTask(action: DeferredAction<TPayload>): FollowupTaskDescriptor

    /** Apply the restore (inverse) — read fresh state, compute delta vs newState, apply only reconciled changes. */
    restore(args: RestoreContext, action: DeferredAction<TPayload>): Promise<RestoreResult>

    /** Optional hook: re-check current world state before triggering follow-up. Can defer if not ready. */
    validateBeforeRestore?(args: RestoreContext, action: DeferredAction<TPayload>): Promise<ValidationResult>

    /** Optional hook: surface in dashboard widget — "1 active temporary action: Conservative · 11 days remaining" */
    describeForDashboard?(action: DeferredAction<TPayload>): DashboardDescriptor

    /** Optional hook: idempotency guard at apply time. Returns reason if duplicate. */
    detectDuplicate?(args: RestoreContext, newPayload: TPayload, existingActions: DeferredAction<TPayload>[]): string | null
}

export interface RestoreContext {
    instanceId: string
    agentId: string
    tokens: { refreshToken: string }
}