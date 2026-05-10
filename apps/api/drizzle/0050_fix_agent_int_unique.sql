-- Phase 2.3.E follow-up — migration 0049 tried to swap the agent_integrations
-- unique constraint from (instance_id, agent_type, integration_type) to
-- (instance_id, agent_id, integration_type), but I dropped by the wrong name.
-- The original constraint is named by Drizzle's auto-generator:
--   agent_integrations_instance_id_agent_type_integration_type_key
-- So 0049's `DROP CONSTRAINT IF EXISTS agent_int_unique` was a no-op, and
-- the new constraint creation likely succeeded as `agent_int_unique` but
-- the OLD one is still in place. Drizzle's onConflictDoUpdate target
-- (instance_id, agent_id, integration_type) doesn't match the OLD
-- constraint, hence: "no unique or exclusion constraint matching the ON
-- CONFLICT specification".
--
-- Drop both possible old names + ensure the new constraint exists.

ALTER TABLE agent_integrations
    DROP CONSTRAINT IF EXISTS agent_integrations_instance_id_agent_type_integration_type_key;
ALTER TABLE agent_integrations
    DROP CONSTRAINT IF EXISTS agent_int_unique;

-- Create the per-agent unique constraint. Note: PostgreSQL treats NULL
-- agent_id as distinct from any other NULL, so legacy rows (no agent_id
-- yet) won't collide. Backfill in 0049 already populated agent_id for
-- existing rows.
ALTER TABLE agent_integrations
    ADD CONSTRAINT agent_int_unique
    UNIQUE (instance_id, agent_id, integration_type);
