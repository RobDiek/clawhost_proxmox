-- Phase 2.3.E follow-up #2 — migration 0050 failed because backfill from
-- 0049 created duplicate rows when an instance had the SAME integration
-- under multiple agent_types in the legacy schema (e.g. telegram saved
-- once for agent_type='mt' and once for 'bare' — both got the same
-- agent_id after backfill, since the VPS only has one primary agent).
--
-- Strategy: keep the most-recently-updated row per
-- (instance_id, agent_id, integration_type), delete the rest, then
-- finally add the new UNIQUE constraint.

-- 1. Delete older duplicates per (instance_id, agent_id, integration_type)
DELETE FROM agent_integrations a
USING agent_integrations b
WHERE a.instance_id = b.instance_id
  AND a.agent_id = b.agent_id
  AND a.integration_type = b.integration_type
  AND a.agent_id IS NOT NULL
  AND a.updated_at < b.updated_at;

-- 2. If two rows for same key have IDENTICAL updated_at (rare race), keep
-- the one with the lowest UUID id and drop the rest.
DELETE FROM agent_integrations a
USING agent_integrations b
WHERE a.instance_id = b.instance_id
  AND a.agent_id = b.agent_id
  AND a.integration_type = b.integration_type
  AND a.agent_id IS NOT NULL
  AND a.updated_at = b.updated_at
  AND a.id > b.id;

-- 3. Make sure the OLD constraint is gone (idempotent)
ALTER TABLE agent_integrations
    DROP CONSTRAINT IF EXISTS agent_integrations_instance_id_agent_type_integration_type_key;
ALTER TABLE agent_integrations
    DROP CONSTRAINT IF EXISTS agent_int_unique;

-- 4. Add the new per-agent unique constraint. PostgreSQL treats each NULL
-- agent_id as distinct, so legacy rows (no mateh_agents row yet) won't
-- collide.
ALTER TABLE agent_integrations
    ADD CONSTRAINT agent_int_unique
    UNIQUE (instance_id, agent_id, integration_type);
