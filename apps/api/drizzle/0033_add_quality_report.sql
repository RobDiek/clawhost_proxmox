-- Creative quality pipeline report (Phase B4) — attached to each render.
-- Decision informs the HITL approval queue: high_confidence = fast-lane,
-- low_confidence = flagged with issues, auto_reject = triggers regen.

ALTER TABLE creative_renders
    ADD COLUMN IF NOT EXISTS quality_score          numeric(4, 2),       -- 0-10
    ADD COLUMN IF NOT EXISTS quality_decision       text,                -- auto_reject | low_confidence | high_confidence
    ADD COLUMN IF NOT EXISTS quality_checks         jsonb,               -- CheckResult[]
    ADD COLUMN IF NOT EXISTS quality_critical_fails jsonb,               -- string[]
    ADD COLUMN IF NOT EXISTS quality_regen_critique text,
    ADD COLUMN IF NOT EXISTS quality_check_cost_usd numeric(10, 4),
    ADD COLUMN IF NOT EXISTS regen_count            integer DEFAULT 0,   -- how many times retried due to auto_reject
    ADD COLUMN IF NOT EXISTS parent_render_id       text REFERENCES creative_renders(id);  -- if this is a regen, points to the original

CREATE INDEX IF NOT EXISTS creative_renders_quality_decision_idx
    ON creative_renders(instance_id, quality_decision);
