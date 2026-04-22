-- Strategy Lab (Phase G) — per-instance learnings extracted weekly from
-- creative_performance + content plan metadata. Feeds the next content-plan
-- generation so the system "learns" which channel / format / pillar / persona
-- / hook_pattern / paid_or_organic wins for this specific tenant.
--
-- One row = one winner/loser pair within a dimension at a point in time.
-- A fresh scan replaces prior rows for the same (instance_id, dimension,
-- measured_until date) so storage stays bounded.

CREATE TABLE IF NOT EXISTS strategy_learnings (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,

    -- Dimension being evaluated
    dimension TEXT NOT NULL,        -- 'channel' | 'format' | 'pillar' | 'persona' | 'hook_pattern' | 'paid_organic'
    winner_value TEXT NOT NULL,     -- e.g. 'linkedin', 'reel', 'אסף-persona', 'numbers_hook'
    loser_value TEXT,               -- worst-performing value in same dimension (may be null if only 1 variant)

    -- Performance summary
    metric TEXT NOT NULL,           -- 'roas' | 'leads' | 'ctr' | 'engagement_rate' | 'conversion_rate'
    winner_score NUMERIC,           -- the winner's metric value
    loser_score NUMERIC,            -- the loser's metric value
    effect_size NUMERIC,            -- winner_score / median_score (how much better than middle)
    data_points_count INTEGER NOT NULL,  -- how many content items / renders back this learning

    -- Trust signals
    confidence TEXT NOT NULL DEFAULT 'low',  -- 'high' (n≥20) | 'medium' (n≥7) | 'low' (n<7)
    measured_since TIMESTAMPTZ NOT NULL,
    measured_until TIMESTAMPTZ NOT NULL,

    -- Recommendation — free-text Hebrew actionable guidance for next plan generation
    recommendation TEXT,

    -- Raw data for audit
    breakdown JSONB,                -- full per-value score table

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sl_instance_dim_idx
    ON strategy_learnings (instance_id, dimension, created_at DESC);
CREATE INDEX IF NOT EXISTS sl_instance_recent_idx
    ON strategy_learnings (instance_id, measured_until DESC);
