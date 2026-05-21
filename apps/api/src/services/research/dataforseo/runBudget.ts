/**
 * Per-run DFS spend tracker — refuses to exceed a stage-defined USD cap.
 *
 * Why this is separate from the per-tenant ledger:
 *   Ledger tracks LIFETIME balance and OPTIONAL monthly cap — it can't
 *   stop a single stage run from burning $5 in one go if budget allows.
 *   Stage specs declare `max_dfs_usd_per_run` (e.g. internal_seo_audit
 *   = $0.50). RunBudget enforces that local cap.
 *
 * Usage:
 *   const budget = new RunBudget(0.50, 'internal_seo_audit')
 *   for (const url of urls) {
 *       budget.requireRemaining(estimatedCallCost)
 *       const result = await onPageInstant(...)
 *       budget.recordSpend(result.cost)
 *   }
 *   const summary = budget.summary()  // { spent, remaining, calls, ... }
 *
 * Throws `RunBudgetExceededError` on requireRemaining() if cap would be
 * exceeded. Callers should catch + degrade gracefully (skip remaining
 * URLs, log warning, return partial results).
 */

export class RunBudgetExceededError extends Error {
    spentUsd: number
    capUsd: number
    stage: string
    constructor(stage: string, spentUsd: number, capUsd: number) {
        super(`Stage ${stage} exceeded DFS budget cap: spent $${spentUsd.toFixed(4)} of $${capUsd.toFixed(4)} cap`)
        this.name = 'RunBudgetExceededError'
        this.spentUsd = spentUsd
        this.capUsd = capUsd
        this.stage = stage
    }
}

export class RunBudget {
    private spent = 0
    private calls = 0
    private cacheHits = 0
    private cacheMisses = 0
    private skipped = 0

    constructor(
        private readonly capUsd: number,
        private readonly stage: string,
    ) {
        if (capUsd <= 0) {
            throw new Error(`RunBudget: capUsd must be > 0, got ${capUsd}`)
        }
    }

    /**
     * Check if a call of ~estimatedCost would exceed the cap.
     * Throws if it would. Callers wrap in try/catch for graceful degrade.
     *
     * `estimatedCost` is optional — if unknown, we just check we haven't
     * already exceeded. DFS calls are cheap ($0.001-$0.05); single calls
     * rarely tip the cap by themselves, so pre-check is approximate.
     */
    requireRemaining(estimatedCost = 0): void {
        const projected = this.spent + estimatedCost
        if (projected > this.capUsd) {
            throw new RunBudgetExceededError(this.stage, this.spent, this.capUsd)
        }
    }

    /** Can we still spend `amount` without throwing? Read-only check (no throw). */
    canAfford(amount = 0): boolean {
        return (this.spent + amount) <= this.capUsd
    }

    /** Record actual DFS cost after a successful call. */
    recordSpend(usd: number): void {
        this.spent += Math.max(0, usd)
        this.calls += 1
    }

    /** Cache hit — no DFS spend, but we want to know coverage. */
    recordCacheHit(): void {
        this.cacheHits += 1
    }

    /** Cache miss → call happened (recordSpend should follow). */
    recordCacheMiss(): void {
        this.cacheMisses += 1
    }

    /** URL we declined to fetch because budget was tight. */
    recordSkipped(): void {
        this.skipped += 1
    }

    summary(): RunBudgetSummary {
        return {
            stage: this.stage,
            cap_usd: this.capUsd,
            spent_usd: Number(this.spent.toFixed(4)),
            remaining_usd: Number((this.capUsd - this.spent).toFixed(4)),
            calls: this.calls,
            cache_hits: this.cacheHits,
            cache_misses: this.cacheMisses,
            skipped: this.skipped,
            utilization_pct: Number(((this.spent / this.capUsd) * 100).toFixed(1)),
        }
    }
}

export interface RunBudgetSummary {
    stage: string
    cap_usd: number
    spent_usd: number
    remaining_usd: number
    calls: number
    cache_hits: number
    cache_misses: number
    skipped: number
    utilization_pct: number
}