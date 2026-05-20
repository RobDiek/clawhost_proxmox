-- Phase 4.3-P — Per-agent Google Ads config isolation.
--
-- Until now `instances.google_ads_config` (jsonb) held customerId,
-- loginCustomerId, developerToken AND the chosen scope (operatingCustomerId
-- + campaignIds). On a multi-MATEH VPS that means a secondary agent
-- (Packing) reads the primary's (Storage's) operatingCustomerId + campaign
-- list — wrong customer + wrong campaigns from the secondary's POV.
--
-- This migration moves the column onto `mateh_agents` so every agent has
-- its own config block. Same Google MCC can be referenced by multiple
-- agents but each picks its own operatingCustomerId + campaign set.
--
-- Backfill rule: copy `instances.google_ads_config` into the PRIMARY
-- mateh_agent row only (the row that historically owned that data).
-- Secondary agents stay NULL — user re-links Ads per agent so they
-- consciously pick a different operatingCustomer/campaign set.
--
-- The legacy `instances.google_ads_config` stays in place for back-compat
-- (primary-only mirror, same pattern as research_data). Old code paths
-- keep working; new code paths read per-agent.

ALTER TABLE "mateh_agents" ADD COLUMN IF NOT EXISTS "google_ads_mode" text;
ALTER TABLE "mateh_agents" ADD COLUMN IF NOT EXISTS "google_ads_config" jsonb;

-- Backfill primaries from the legacy instance column.
UPDATE "mateh_agents" ma
SET
    "google_ads_mode"   = i."google_ads_mode",
    "google_ads_config" = i."google_ads_config"
FROM "instances" i
WHERE ma."vps_instance_id" = i."id"
  AND ma."is_primary" = true
  AND ma."google_ads_config" IS NULL;
