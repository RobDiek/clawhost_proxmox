-- Phase 2.3.D — full per-agent isolation across remaining shared tables.
--
-- Audit identified 11 tables that store per-agent data but only had
-- instance_id, which leaks data between mateh_agents on the same VPS
-- (agency mode). This migration adds agent_id (FK → mateh_agents.id,
-- nullable, ON DELETE SET NULL) + backfills existing rows to the VPS's
-- primary mateh_agent + adds an index per table.
--
-- Tables migrated:
--   1. agent_integrations  (also fixes the unique-constraint collision
--                           where 2 secondary MATEHs both stored as 'mt')
--   2. brand_books         (per-brand identity)
--   3. knowledge_documents + knowledge_chunks (per-brand knowledge base)
--   4. creative_renders + content_plan_media   (per-agent media)
--   5. creative_references (competitor library + winners)
--   6. creative_hypotheses (A/B tests)
--   7. creative_fatigue_alerts
--   8. strategy_learnings
--
-- creative_performance + platform_creative_mappings inherit isolation via
-- render_id → creative_renders.agent_id (no own column needed).
--
-- Rollout strategy: nullable column + backfill so existing legacy rows
-- (where agent_id IS NULL after this migration) act as primary's data;
-- new rows MUST set agent_id via the controllers (which already resolve
-- the active agent in Phase 2.3.A/B/C).

-- ── 1. agent_integrations ─────────────────────────────────────────────
-- The legacy unique constraint (instance_id, agent_type, integration_type)
-- collapses 2+ secondary mateh_agents (both type='mt') into one row.
-- Drop it, add agent_id, and re-create unique on (instance_id, agent_id,
-- integration_type) so each mateh_agent has its own row per integration.

ALTER TABLE agent_integrations
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_integrations_agent_idx
    ON agent_integrations (agent_id);

-- Backfill: every existing agent_integrations row → primary agent of its VPS
UPDATE agent_integrations ai
SET agent_id = ma.id
FROM mateh_agents ma
WHERE ai.agent_id IS NULL
  AND ma.vps_instance_id = ai.instance_id
  AND ma.is_primary = true;

-- Replace unique constraint. Old: (instance_id, agent_type, integration_type)
-- → conflict with multi-MATEH. New: (instance_id, agent_id, integration_type)
-- — each mateh_agent has its own integration entry.
ALTER TABLE agent_integrations DROP CONSTRAINT IF EXISTS agent_int_unique;
ALTER TABLE agent_integrations
    ADD CONSTRAINT agent_int_unique
    UNIQUE (instance_id, agent_id, integration_type);

-- ── 2. brand_books ────────────────────────────────────────────────────
-- Brand book is per-agent (each MATEH manages its own brand). Without
-- agent_id, secondary mateh_agent's brand book gets versioned in the
-- same row as the primary's because of the (instance_id, version) uniq.

ALTER TABLE brand_books
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brand_books_agent_idx ON brand_books (agent_id);

UPDATE brand_books bb
SET agent_id = ma.id
FROM mateh_agents ma
WHERE bb.agent_id IS NULL
  AND ma.vps_instance_id = bb.instance_id
  AND ma.is_primary = true;

-- Replace (instance_id, version) uniq with (instance_id, agent_id, version)
-- so each mateh_agent has its own version sequence.
ALTER TABLE brand_books DROP CONSTRAINT IF EXISTS brand_books_instance_version_uniq;
ALTER TABLE brand_books
    ADD CONSTRAINT brand_books_instance_agent_version_uniq
    UNIQUE (instance_id, agent_id, version);

-- ── 3. knowledge_documents + knowledge_chunks ─────────────────────────

ALTER TABLE knowledge_documents
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS knowledge_documents_agent_idx
    ON knowledge_documents (agent_id);
UPDATE knowledge_documents kd
SET agent_id = ma.id
FROM mateh_agents ma
WHERE kd.agent_id IS NULL
  AND ma.vps_instance_id = kd.instance_id
  AND ma.is_primary = true;

ALTER TABLE knowledge_chunks
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS knowledge_chunks_agent_idx
    ON knowledge_chunks (agent_id);
UPDATE knowledge_chunks kc
SET agent_id = kd.agent_id
FROM knowledge_documents kd
WHERE kc.document_id = kd.id
  AND kc.agent_id IS NULL;

-- ── 4. creative_renders + content_plan_media ──────────────────────────

ALTER TABLE creative_renders
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS creative_renders_agent_idx
    ON creative_renders (agent_id);
UPDATE creative_renders cr
SET agent_id = ma.id
FROM mateh_agents ma
WHERE cr.agent_id IS NULL
  AND ma.vps_instance_id = cr.instance_id
  AND ma.is_primary = true;

ALTER TABLE content_plan_media
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS content_plan_media_agent_idx
    ON content_plan_media (agent_id);
UPDATE content_plan_media cpm
SET agent_id = ma.id
FROM mateh_agents ma
WHERE cpm.agent_id IS NULL
  AND ma.vps_instance_id = cpm.instance_id
  AND ma.is_primary = true;

-- ── 5. creative_references ────────────────────────────────────────────

ALTER TABLE creative_references
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS creative_references_agent_idx
    ON creative_references (agent_id);
UPDATE creative_references cr
SET agent_id = ma.id
FROM mateh_agents ma
WHERE cr.agent_id IS NULL
  AND ma.vps_instance_id = cr.instance_id
  AND ma.is_primary = true;

-- ── 6. creative_hypotheses ────────────────────────────────────────────

ALTER TABLE creative_hypotheses
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS creative_hypotheses_agent_idx
    ON creative_hypotheses (agent_id);
UPDATE creative_hypotheses ch
SET agent_id = ma.id
FROM mateh_agents ma
WHERE ch.agent_id IS NULL
  AND ma.vps_instance_id = ch.instance_id
  AND ma.is_primary = true;

-- ── 7. creative_fatigue_alerts ────────────────────────────────────────

ALTER TABLE creative_fatigue_alerts
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS creative_fatigue_alerts_agent_idx
    ON creative_fatigue_alerts (agent_id);
UPDATE creative_fatigue_alerts cfa
SET agent_id = ma.id
FROM mateh_agents ma
WHERE cfa.agent_id IS NULL
  AND ma.vps_instance_id = cfa.instance_id
  AND ma.is_primary = true;

-- ── 8. strategy_learnings ─────────────────────────────────────────────

ALTER TABLE strategy_learnings
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS strategy_learnings_agent_idx
    ON strategy_learnings (agent_id);
UPDATE strategy_learnings sl
SET agent_id = ma.id
FROM mateh_agents ma
WHERE sl.agent_id IS NULL
  AND ma.vps_instance_id = sl.instance_id
  AND ma.is_primary = true;
