-- Phase 4.6 — Hypothesis executor tracking.
--
-- Adds 4 columns to `hypotheses` so the executor pathway (apiActionRecipe →
-- platform mutation API call) can record what happened: did the dry-run
-- succeed, did the live execution land, what was the response, when did it
-- happen, and which mode (self vs managed account vs dry-run).
--
-- All columns are nullable — a hypothesis without an apiActionRecipe never
-- gets executed, and these stay NULL.

ALTER TABLE hypotheses
    ADD COLUMN IF NOT EXISTS execution_status TEXT,
    ADD COLUMN IF NOT EXISTS execution_log    JSONB,
    ADD COLUMN IF NOT EXISTS executed_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS executed_by      TEXT;

CREATE INDEX IF NOT EXISTS hypotheses_execution_status_idx
    ON hypotheses (instance_id, execution_status)
    WHERE execution_status IS NOT NULL;

COMMENT ON COLUMN hypotheses.execution_status IS
    'NULL | queued | dry_run_ok | dry_run_failed | executed | execution_failed | reverted';
COMMENT ON COLUMN hypotheses.execution_log IS
    'JSONB log: dryRunResult, liveResult, errorMessage, executionMode, attemptsCount, etc.';
