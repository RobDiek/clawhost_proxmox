-- Tenant sovereignty Phase 2.3 (execution inversion), roadmap/17.
--
-- Adds instances.exec_mode: the per-instance flag that gates HOW orchestration
-- runs.
--   'central' — clawflow-api orchestrates + root-SSHes `openclaw agent` into the
--               VPS (today's behavior).
--   'vps'     — execution runs on the VPS; center sends an authenticated run-job
--               signal instead of root-SSH. Only after the VPS path is proven.
--
-- Rollback lever for P2.3. Default 'central' = no behavior change until an
-- instance is explicitly flipped (master 44f484a852 first, then 19c2481ba5).
--
-- Safe online: NOT NULL + constant DEFAULT backfills every row to 'central'.
-- Idempotent via IF NOT EXISTS.
-- Rollback: ALTER TABLE instances DROP COLUMN IF EXISTS exec_mode;
ALTER TABLE instances
    ADD COLUMN IF NOT EXISTS exec_mode text NOT NULL DEFAULT 'central';
