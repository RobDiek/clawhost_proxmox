/**
 * Phase 4.3-R — Onboarding Audit Framework
 *
 * Output schema for the comprehensive audit service. Each check produces a
 * structured `AuditFinding`. The orchestrator aggregates them into an
 * `AuditReport` with overall verdict and category-grouped findings.
 *
 * Design principles:
 *   - DETERMINISTIC: no LLM in the audit loop. Every check compares two
 *     concrete data sources and reports the diff. Reproducible bit-by-bit.
 *   - GROUND-TRUTH FIRST: where possible, fetch the source-of-truth live
 *     (HTML, API response) and compare to what the system stored.
 *   - EVIDENCE-BACKED: every finding carries the exact bytes that justify
 *     it (URL, JSON snippet, line ref). No vague "looks off".
 *   - ACTIONABLE: every fail/warn has a `fixHint` telling the operator
 *     what file/migration/manual step to run.
 */

export type AuditSeverity = 'pass' | 'warn' | 'fail' | 'info'

export type AuditCategory =
    | 'schema_drift'        // DFS / external API response shape vs our extractor
    | 'cross_agent'         // Per-agent isolation gaps
    | 'integration'         // Writer↔reader field-name coherence
    | 'ground_truth'        // Stored audit claims vs live re-fetch
    | 'pipeline_health'     // Stage completion, NULL agent_ids, stuck states
    | 'retry_resilience'    // Long-running API calls without retry
    | 'render_determinism'  // UI render correctness (advisory only)
    | 'data_dedup'          // Records collapsing to same logical entity (URL trailing slash, etc.)

export interface AuditFinding {
    category: AuditCategory
    /** Short ID — useful for grep / dedupe. e.g. 'wp_field_drift', 'sibling_token_leak'. */
    id: string
    /** Human-readable headline */
    title: string
    severity: AuditSeverity
    /** What we compared and what the diff was */
    detail: string
    /** Evidence — raw bytes / snippets that justify the verdict */
    evidence?: Record<string, unknown>
    /** What to do about it */
    fixHint?: string
    /** When relevant — the agent / URL / record this finding pertains to */
    scope?: {
        instanceId?: string
        agentId?: string | null
        agentName?: string
        url?: string
        stageId?: string
        recordIndex?: number
    }
}

export interface AuditReport {
    instanceId: string
    agentId: string | null
    agentName: string
    ranAt: string
    durationMs: number
    overall: 'ship_ready' | 'has_issues' | 'has_blockers'
    counts: { pass: number; warn: number; fail: number; info: number }
    findings: AuditFinding[]
    /** Per-category summary so caller can render a compact dashboard */
    categorySummary: Record<AuditCategory, { pass: number; warn: number; fail: number }>
}

/** Per-check signature. Each implementation returns 0+ findings. */
export type AuditCheck = (ctx: AuditContext) => Promise<AuditFinding[]>

export interface AuditContext {
    instanceId: string
    agentId: string | null
    /** Loaded once and shared across checks for efficiency */
    activeAgentName: string
    activeBrandSlug: string
    /** Bounded re-fetch budget — checks that hit external URLs should
     *  consume from this so we don't accidentally fan out to 100s of
     *  network requests on a 200-URL audit. */
    networkBudget: {
        maxHttpFetches: number
        remaining: number
    }
    /** Sampling cap — for stages with many records, audit a deterministic
     *  N (highest-impact + a random sample) instead of all. */
    sampleSize: number
}