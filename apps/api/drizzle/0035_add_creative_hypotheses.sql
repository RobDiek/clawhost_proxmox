-- Phase B6 — A/B Testing Framework
--
-- creative_hypotheses — pre-registered hypotheses about which creative
-- variants will win on specified metrics. Enforces:
--   1. Pre-registration (pre_registered_at MUST be set before variants run)
--   2. Min spend / min days guardrails (don't conclude prematurely)
--   3. Max 4 variants (fragmentation kills statistical power)
--   4. Automatic Bayesian concluder polls performance daily
--
-- Workflow:
--   draft → pre_registered → running → concluded | inconclusive | abandoned
--
-- On conclude: winner_render_id set, posterior_probability recorded,
-- insight_he saved as fact. Future Yotzer Gate 1 queries pick up the insight.

CREATE TABLE IF NOT EXISTS creative_hypotheses (
    id                  text PRIMARY KEY,
    instance_id         text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,

    -- The hypothesis itself
    statement           text NOT NULL,         -- "hook=testimony beats hook=direct for persona X"
    reasoning           text,                   -- why (ties to research/prev winners)
    primary_metric      text NOT NULL,          -- 'ctr' | 'roas' | 'hook_rate' | 'conversion_rate'
    success_direction   text NOT NULL DEFAULT 'higher',  -- 'higher' | 'lower'

    -- Variants (jsonb — small list, typically 2-4 items)
    -- Shape: [{ renderId: text, label: text, predictedLift?: number, launchedAt?: iso }]
    variants            jsonb NOT NULL DEFAULT '[]',
    control_render_id   text REFERENCES creative_renders(id) ON DELETE SET NULL,

    -- Guardrails
    min_spend_ils       numeric(10, 2) DEFAULT 200,       -- per variant
    min_days_running    integer        DEFAULT 7,
    max_variants        integer        DEFAULT 4,

    -- Pre-registration (mandatory before any variant launches)
    pre_registered_at   timestamptz,
    registered_by       text,

    -- Status
    status              text NOT NULL DEFAULT 'draft',
    -- draft | pre_registered | running | concluded | inconclusive | abandoned

    -- Conclusion (set when analyzer finishes)
    concluded_at        timestamptz,
    winner_render_id    text REFERENCES creative_renders(id) ON DELETE SET NULL,
    loser_render_ids    text[] DEFAULT '{}',
    posterior_probability numeric(5, 4),        -- 0.0000 - 1.0000 (P winner beats rest)
    metric_lift_pct     numeric(8, 3),          -- lift vs control, e.g. 17.234 means +17.23%
    analysis            jsonb,                   -- raw {meanCTR, nSamples, ci95, perVariantPosteriors, ...}
    insight_he          text,                    -- Hebrew insight for facts graph
    insight_en          text,
    saved_as_fact       jsonb,                   -- fact triple to push to Neo4j later

    -- Abandonment
    abandoned_reason    text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creative_hypotheses_instance_idx
    ON creative_hypotheses(instance_id, status);
CREATE INDEX IF NOT EXISTS creative_hypotheses_running_idx
    ON creative_hypotheses(instance_id, pre_registered_at)
    WHERE status IN ('pre_registered', 'running');

-- Add a link from creative_renders to the hypothesis they're part of (optional).
-- Fast lookup: "which hypothesis does this render belong to?"
ALTER TABLE creative_renders
    ADD COLUMN IF NOT EXISTS hypothesis_id    text REFERENCES creative_hypotheses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS variant_label    text;

CREATE INDEX IF NOT EXISTS creative_renders_hypothesis_idx
    ON creative_renders(hypothesis_id)
    WHERE hypothesis_id IS NOT NULL;
