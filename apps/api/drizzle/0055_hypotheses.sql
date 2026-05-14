-- Phase 4.1 Layer-3: Hypothesis Engine.
--
-- A hypothesis is a testable, dated, action-attached claim about a paid-track
-- account. The full lifecycle:
--
--   proposed → approved → testing → { validated | rejected | inconclusive }
--                    └─→ rejected (user/auto declined to test)
--                    └─→ expired (sat in proposed too long)
--                    └─→ superseded (newer hypothesis on same scope replaced it)
--
-- Disciplines this table enforces:
--
--   1. Every hypothesis has an evidence_snapshot — frozen metrics from the
--      moment of proposal. Re-aggregations later can produce different
--      numbers (delayed attribution, data corrections) — we keep the
--      original so "did we make the right call given what we knew?" is
--      always answerable.
--
--   2. Every hypothesis has explicit test_success_criteria — no
--      hand-waving about "did it work?" The cron resolver evaluates
--      criteria mechanically.
--
--   3. Manual-mode and active-mode actions are SEPARATE columns. Active-mode
--      hypotheses can downgrade to manual if OAuth isn't connected. Manual
--      mode can upgrade to active when OAuth lands later.
--
--   4. Dedup: (instance_id, hypothesis_code, scope_platform, scope_entity_id,
--      status='proposed') is unique. Generator can't propose the same
--      hypothesis twice while the first is still open.

CREATE TABLE IF NOT EXISTS hypotheses (
    id                          BIGSERIAL PRIMARY KEY,
    instance_id                 TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    agent_id                    TEXT REFERENCES mateh_agents(id) ON DELETE SET NULL,

    -- ── Identity ──────────────────────────────────────────────────────────
    -- Canonical code for grouping/dedup. See services/hypothesisEngine/types.ts.
    -- Examples: 'bidding_tier_mismatch_max_clicks_to_max_conv', 'outlier_underperformer',
    -- 'tracking_gap_attribution_unknown', 'conversion_event_mix_off_objective',
    -- 'frequency_saturation_meta', 'opus_audit_<topic>'.
    hypothesis_code             TEXT NOT NULL,
    title                       TEXT NOT NULL,
    title_he                    TEXT NOT NULL,

    -- ── Scope: which slice of data does this concern ──────────────────────
    scope_platform              TEXT,            -- 'meta'|'google_ads'|'cross_platform'|'account'
    scope_data_type             TEXT,            -- 'campaign'|'adset'|'ad'|'keyword'|'account'|'event'
    scope_entity_id             TEXT,            -- nullable for account-wide
    scope_entity_name           TEXT,
    scope_event_name            TEXT,            -- nullable, conversion event
    scope_window_start          DATE NOT NULL,
    scope_window_end            DATE NOT NULL,

    -- ── The hypothesis itself ─────────────────────────────────────────────
    -- observation: what we see in the data ("Campaign X spent 35% of budget but produced 12% of conversions")
    observation                 TEXT NOT NULL,
    observation_he              TEXT NOT NULL,
    -- hypothesis: what we think causes it / what changing X would do
    hypothesis                  TEXT NOT NULL,
    hypothesis_he               TEXT NOT NULL,
    -- reasoning: longer rationale citing the relevant numbers + theory
    reasoning                   TEXT NOT NULL,
    reasoning_he                TEXT NOT NULL,

    -- ── Severity / actionability ──────────────────────────────────────────
    severity                    TEXT NOT NULL,   -- 'critical'|'high'|'medium'|'low'
    confidence                  NUMERIC(4, 3) NOT NULL,  -- 0..1
    -- Expected upside or downside if the proposed action is taken. Sign matters:
    -- negative means avoided loss; positive means projected gain.
    expected_impact_ils         NUMERIC(14, 2),
    -- What KIND of impact: 'spend_reduction'|'conv_uplift'|'cpa_reduction'|'roas_uplift'|'risk_mitigation'
    expected_impact_kind        TEXT,
    -- Time horizon of the expected impact (days). Typically 30 or 90.
    expected_impact_window_days INTEGER DEFAULT 30,

    -- ── Evidence pointer ──────────────────────────────────────────────────
    -- evidence_snapshot: frozen at proposal time. Schema is generator-specific
    -- but ALWAYS includes "as_of": ISO timestamp + "metrics": {...} + "row_ids": [...]
    evidence_snapshot           JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Min quality_score across the underlying ingested_data_points rows.
    -- Phase 2.5+ uses this to weight Smart Bidding decisions.
    evidence_quality_score      NUMERIC(4, 3),

    -- ── Proposed action (manual + active mode forks) ──────────────────────
    -- Action summary (short, used in UI)
    proposed_action             TEXT NOT NULL,
    proposed_action_he          TEXT NOT NULL,
    -- Manual mode: step-by-step Hebrew instructions for non-technical users.
    -- Array of: { step, platform, action_label, action_label_he, screenshot_hint, verify }
    manual_instructions         JSONB,
    -- Active mode: API call recipe. Schema:
    --   { platform, api, endpoint, payload, dry_run_endpoint, approval_required, guardrails }
    -- Per D5 directive: 'approval_required' is TRUE by default for any action
    -- touching live spend; can be FALSE only for reversible operations on
    -- paused campaigns.
    api_action_recipe           JSONB,

    -- ── Lifecycle ─────────────────────────────────────────────────────────
    status                      TEXT NOT NULL DEFAULT 'proposed',
    -- 'proposed' | 'approved' | 'testing' | 'validated' | 'rejected' | 'inconclusive' | 'expired' | 'superseded' | 'declined'
    proposed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at                 TIMESTAMPTZ,
    approved_by                 TEXT,             -- 'user' | 'platform_auto'
    declined_at                 TIMESTAMPTZ,
    declined_reason             TEXT,
    testing_started_at          TIMESTAMPTZ,
    -- When the resolver cron should evaluate. testing_started_at + test_window_days.
    test_evaluation_due_at      TIMESTAMPTZ,
    resolved_at                 TIMESTAMPTZ,

    -- ── Test parameters ───────────────────────────────────────────────────
    -- 'before_after_window' | 'ab_split' | 'holdout' | 'time_series_changepoint'
    test_method                 TEXT,
    test_window_days            INTEGER,
    -- success_criteria: { metric, direction, threshold_pct, min_conv, min_spend_ils, p_value_max }
    -- Example: { metric: 'cpa_ils', direction: 'decrease', threshold_pct: 15,
    --            min_conv: 30, min_spend_ils: 500 }
    test_success_criteria       JSONB,

    -- ── Outcome (filled at resolution) ────────────────────────────────────
    outcome_evidence_snapshot   JSONB,
    outcome_impact_ils          NUMERIC(14, 2),
    outcome_summary             TEXT,
    outcome_summary_he          TEXT,
    -- 'validated' | 'rejected' | 'inconclusive'
    outcome_resolution          TEXT,

    -- ── Provenance ────────────────────────────────────────────────────────
    -- 'rule_engine' | 'opus_audit' | 'sonnet_pattern' | 'user_proposed' | 'anomaly_detector'
    source                      TEXT NOT NULL,
    generated_by_model          TEXT,  -- when source is LLM-driven

    -- ── Supersession link ─────────────────────────────────────────────────
    -- When a newer hypothesis on the same scope replaces this one.
    superseded_by               BIGINT REFERENCES hypotheses(id) ON DELETE SET NULL,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hypotheses_instance_status_idx
    ON hypotheses (instance_id, status);
CREATE INDEX IF NOT EXISTS hypotheses_agent_status_idx
    ON hypotheses (agent_id, status);
CREATE INDEX IF NOT EXISTS hypotheses_code_idx
    ON hypotheses (instance_id, hypothesis_code);
CREATE INDEX IF NOT EXISTS hypotheses_scope_idx
    ON hypotheses (instance_id, scope_platform, scope_entity_id);
CREATE INDEX IF NOT EXISTS hypotheses_eval_due_idx
    ON hypotheses (test_evaluation_due_at)
    WHERE status = 'testing' AND test_evaluation_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS hypotheses_proposed_at_idx
    ON hypotheses (instance_id, proposed_at DESC);

-- Dedup: cannot propose the same hypothesis_code on the same scope while
-- one is still open. (status NOT IN closed-states) ⇒ deferred constraint via
-- partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS hypotheses_open_uniq
    ON hypotheses (instance_id, hypothesis_code, COALESCE(scope_platform, ''), COALESCE(scope_entity_id, ''))
    WHERE status IN ('proposed', 'approved', 'testing');
