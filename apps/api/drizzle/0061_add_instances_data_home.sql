-- Tenant sovereignty (Phase 2, roadmap/16 + roadmap/17).
--
-- Adds instances.data_home: the per-instance flag that gates where the tenant's
-- content (research_data / agent_outputs / brand_books) is canonical.
--   'central' — central Postgres is the source of truth (today's behavior).
--   'dual'    — central canonical + best-effort shadow write to the on-VPS
--               sovereign-store (P2.1; reads still come from central).
--   'vps'     — VPS sovereign-store is canonical; central is the shadow copy
--               during the rollback window (P2.2+).
--
-- Every flip of this flag is the rollback lever. Default 'central' means adding
-- the column changes NOTHING until an instance is explicitly opted in — starting
-- with master 44f484a852, then (only after a green gate) paying client 19c2481ba5.
--
-- Safe to run online: NOT NULL with a constant DEFAULT backfills every existing
-- row to 'central' in one statement. Idempotent via IF NOT EXISTS.
-- Rollback: ALTER TABLE instances DROP COLUMN IF EXISTS data_home;
ALTER TABLE instances
    ADD COLUMN IF NOT EXISTS data_home text NOT NULL DEFAULT 'central';
