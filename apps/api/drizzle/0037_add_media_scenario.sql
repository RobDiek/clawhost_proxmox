-- Phase M.1.5 — scenario tracking for creative optimization
-- Each render records which "recipe" produced it so the optimization
-- report can compare performance across scenarios.

ALTER TABLE content_plan_media ADD COLUMN IF NOT EXISTS scenario text;
CREATE INDEX IF NOT EXISTS cpm_scenario_idx ON content_plan_media (instance_id, scenario);
