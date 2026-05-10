-- Phase 2.3.C — agent_outputs isolation per mateh_agent.
--
-- Before this migration agent_outputs only had instance_id, so when a VPS
-- hosted multiple mateh_agents (agency mode) every agent saw every other
-- agent's outputs in the approval queue. Adds agent_id FK + backfills
-- existing rows to the VPS's primary mateh_agent so secondaries start
-- with a clean queue.
--
-- New rows still need callers to set agent_id explicitly; controller
-- query also accepts a NULL agent_id as "primary's legacy output" only
-- when the active agent is the primary.

ALTER TABLE agent_outputs
    ADD COLUMN IF NOT EXISTS agent_id text REFERENCES mateh_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_outputs_agent_idx ON agent_outputs (agent_id);

-- Backfill: every existing output is attributed to the primary mateh_agent
-- of its VPS. (Pre-multi-agent era — every output came from the primary.)
UPDATE agent_outputs ao
SET agent_id = ma.id
FROM mateh_agents ma
WHERE ao.agent_id IS NULL
  AND ma.vps_instance_id = ao.instance_id
  AND ma.is_primary = true;
