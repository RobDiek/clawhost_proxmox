-- Phase 4.3 — paid Performance Loop.
--
-- Each row = an aggregated learning derived from a window of resolved
-- hypotheses. The hypothesis engine writes individual outcomes; this table
-- holds the ROLLUP across hypotheses_code × platform × outcome distribution
-- so subsequent opusAudit runs can "remember" what worked vs. what didn't
-- WITHOUT re-querying the entire hypotheses table on every prompt build.
--
-- Why a table not a view: opusAudit prompt-injection has to be FAST (Opus
-- reads the block synchronously). We pre-compute weekly + read in O(1).
--
-- Why per-instance scoping: each tenant has different verticals, budgets,
-- audiences — a learning that holds for Storage Station won't necessarily
-- transfer to a legal firm. Cross-tenant aggregation comes later (Phase 5).

CREATE TABLE IF NOT EXISTS paid_learnings (
    id                          BIGSERIAL PRIMARY KEY,
    instance_id                 TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    agent_id                    TEXT REFERENCES mateh_agents(id) ON DELETE SET NULL,

    -- ── Window covered ────────────────────────────────────────────────────
    window_start                DATE NOT NULL,
    window_end                  DATE NOT NULL,
    /** 7d | 14d | 28d | 90d — keep coarse to avoid stretching thin data. */
    window_grain                TEXT NOT NULL DEFAULT '28d',

    -- ── What we learned ───────────────────────────────────────────────────
    -- Group key. Multiple flavors stored so different injectors can pick
    -- the right granularity:
    --   'by_code'              — aggregate over (hypothesis_code) only
    --   'by_code_platform'     — (hypothesis_code, platform)
    --   'by_code_tier'         — (hypothesis_code, paid tier T0-T4)
    --   'by_code_severity'     — (hypothesis_code, severity)
    --   'cross_code'           — overall accuracy of the engine itself
    grouping                    TEXT NOT NULL,
    /** Stable key string e.g. 'bidding_tier_demotion|meta|T1'. */
    group_key                   TEXT NOT NULL,
    /** Human-readable Hebrew label for prompt injection. */
    group_label_he              TEXT NOT NULL,

    -- ── Outcome distribution ──────────────────────────────────────────────
    proposed_count              INTEGER NOT NULL DEFAULT 0,
    approved_count              INTEGER NOT NULL DEFAULT 0,
    testing_count               INTEGER NOT NULL DEFAULT 0,
    validated_count             INTEGER NOT NULL DEFAULT 0,
    rejected_count              INTEGER NOT NULL DEFAULT 0,
    inconclusive_count          INTEGER NOT NULL DEFAULT 0,
    declined_count              INTEGER NOT NULL DEFAULT 0,
    expired_count               INTEGER NOT NULL DEFAULT 0,

    -- Outcome rates (computed at aggregation time for fast read)
    /** validated / (validated + rejected + inconclusive) — engine "hit rate". */
    validation_rate             NUMERIC(4, 3),
    /** declined / proposed — how often user dismisses without trying. */
    decline_rate                NUMERIC(4, 3),
    /** inconclusive / (validated + rejected + inconclusive) — engine "data hunger". */
    inconclusive_rate           NUMERIC(4, 3),

    -- ── Impact summary (across validated outcomes) ────────────────────────
    sum_outcome_impact_ils      NUMERIC(14, 2),
    median_test_window_days     INTEGER,

    -- ── Sample size + confidence ──────────────────────────────────────────
    sample_size                 INTEGER NOT NULL,
    /** 'high' if ≥10 samples; 'medium' if 5-9; 'low' if 1-4; 'insufficient' if 0 */
    confidence                  TEXT NOT NULL DEFAULT 'low',

    -- ── Compacted insight (Hebrew, for prompt injection) ──────────────────
    /** 1-line Hebrew takeaway. Empty when confidence='insufficient'. */
    insight_he                  TEXT NOT NULL DEFAULT '',
    /** Whether this insight should be INJECTED into future prompts (filter low-signal rows). */
    inject_into_prompts         BOOLEAN NOT NULL DEFAULT FALSE,

    -- ── Provenance ────────────────────────────────────────────────────────
    /** ISO of when paidLearner.aggregate.ts wrote this row. */
    computed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    /** Method version — bump when aggregation logic changes so we can A/B old vs new. */
    aggregator_version          TEXT NOT NULL DEFAULT 'v1',

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paid_learnings_instance_window_idx
    ON paid_learnings (instance_id, window_end DESC);
CREATE INDEX IF NOT EXISTS paid_learnings_grouping_idx
    ON paid_learnings (instance_id, grouping, window_end DESC);
CREATE INDEX IF NOT EXISTS paid_learnings_inject_idx
    ON paid_learnings (instance_id, inject_into_prompts, window_end DESC)
    WHERE inject_into_prompts = TRUE;

-- Replace prior aggregation when a new window is computed for same instance
-- and same group_key. We don't want history bloat — keep only the latest
-- aggregation per (instance, grouping, group_key).
CREATE UNIQUE INDEX IF NOT EXISTS paid_learnings_latest_uniq
    ON paid_learnings (instance_id, grouping, group_key);
