-- Phase 2.1 — multi-MATEH-per-VPS data layer.
--
-- The original architecture was: 1 `instances` row = 1 VPS = 1 MATEH agent
-- (single component flag 'mt' in selected_components). Agency-mode use case
-- (Sergei's master: 1 VPS hosts Flowmatic MATEH + 3 ClientA MATEH agents)
-- needs N agents per VPS, each with own brand folder, telegram bot, gateway
-- port, openclaw token, AI provider key, and tenant assignment.
--
-- This migration introduces `mateh_agents` table:
--   - Each row = one running agent (MATEH / OpenClaw / bare) on a VPS.
--   - vps_instance_id FK → instances.id (the VPS host)
--   - tenant_id FK → tenants.id (the tenant this agent belongs to)
--   - All per-agent state (brand, tokens, integrations, research, schedules)
--     moves here; `instances` becomes the VPS-level record only.
--
-- Backfill: every existing instance with 'mt' or 'oc' in selected_components
-- gets one mateh_agents row, copying the per-agent fields from instances.
-- The instances.* fields are KEPT for backward-compat during migration; new
-- code paths read from mateh_agents, old paths still work until all callers
-- are migrated (Phase 2.3).
--
-- Resource layout on the VPS (Phase 2.2 will implement):
--   /home/openclaw/agents/<agentId>/         — root for each agent
--   /home/openclaw/agents/<agentId>/workspace/brands/<brandSlug>/
--   /home/openclaw/agents/<agentId>/data/openclaw/
--   /home/openclaw/agents/<agentId>/docker-compose.yml  (project name = agentId)
--   nginx vhost: m-<agentId>.<vps-subdomain>.openclaw.flowmatic.co.il → port
--   gateway port: 3000 + N (allocated per agent)

CREATE TABLE IF NOT EXISTS mateh_agents (
    id                          TEXT PRIMARY KEY,
    -- The VPS host. Multi-agents-per-VPS = multiple rows with same vps_instance_id.
    vps_instance_id             TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    -- The tenant this agent belongs to. Different agents on the same VPS can
    -- belong to different tenants (agency case). Cascade-set-null on tenant
    -- delete: agent stays alive but unassigned, so we can reassign manually.
    tenant_id                   TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    -- 'mateh' = full marketing agent (9 sub-agents)
    -- 'oc'    = OpenClaw Personal (lightweight)
    -- 'bare'  = no agent stack, just OS / dev environment
    agent_type                  TEXT NOT NULL DEFAULT 'mateh',
    -- Display name shown in dashboard agent list ("Flowmatic SEO" etc).
    name                        TEXT NOT NULL,
    -- Brand folder slug under workspace/brands/. URL-safe, immutable post-create.
    brand_slug                  TEXT NOT NULL,
    -- Per-agent subdomain segment ("m-<short-id>") and gateway port (3000+).
    subdomain_agent             TEXT,
    subdomain_flows             TEXT,
    gateway_port                INTEGER,
    -- Independent secrets per agent.
    openclaw_token              TEXT,
    automation_password         TEXT,
    -- Per-agent AI provider keys (override tenant default + master env).
    ai_provider_key             TEXT,
    ai_provider_type            TEXT,
    openai_api_key              TEXT,
    fal_api_key                 TEXT,
    elevenlabs_api_key          TEXT,
    -- SEO / scraping (currently per-VPS in `instances`; per-agent here).
    dataforseo_key              TEXT,
    firecrawl_key               TEXT,
    -- Sub-agent model overrides (same shape as instances.sub_agent_models).
    sub_agent_models            JSONB,
    -- Per-agent integrations (each agent can have its own Google/Meta/MS account).
    google_tokens               JSONB,
    meta_tokens                 JSONB,
    microsoft_tokens            JSONB,
    gsc_tokens                  JSONB,
    github_config               JSONB,
    -- Telegram (each agent has its own bot — required by Telegram, one bot = one token).
    telegram_chat_id            TEXT,
    telegram_bot_token          TEXT,
    telegram_webhook_secret     TEXT,
    -- Research pipeline output for THIS agent only.
    research_data               JSONB,
    onboarding_step             INTEGER NOT NULL DEFAULT 0,
    onboarding_completed        BOOLEAN NOT NULL DEFAULT FALSE,
    -- Schedules (cron settings) — per-agent.
    schedules                   JSONB,
    -- Status: 'provisioning' | 'running' | 'failed' | 'suspended' | 'terminated'.
    status                      TEXT NOT NULL DEFAULT 'provisioning',
    -- Health snapshot from the agent (heartbeat reports).
    last_health_report          JSONB,
    last_health_at              TIMESTAMP WITH TIME ZONE,
    -- Auto-heal toggle (per-agent, can differ from VPS-level).
    auto_heal                   BOOLEAN NOT NULL DEFAULT TRUE,
    -- Marker: this is THE agent that the VPS was originally provisioned with.
    -- Used by backward-compat code paths that still read from instances.*
    -- fields. Exactly one mateh_agents row per VPS has is_primary=TRUE.
    is_primary                  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Per-agent VPS uniqueness: only ONE primary per VPS.
    CONSTRAINT mateh_agents_one_primary_per_vps EXCLUDE (vps_instance_id WITH =) WHERE (is_primary = TRUE)
);

CREATE INDEX IF NOT EXISTS mateh_agents_vps_idx
    ON mateh_agents(vps_instance_id);
CREATE INDEX IF NOT EXISTS mateh_agents_tenant_idx
    ON mateh_agents(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mateh_agents_status_idx
    ON mateh_agents(status);
-- Subdomain uniqueness — needed for nginx routing.
CREATE UNIQUE INDEX IF NOT EXISTS mateh_agents_subdomain_unique
    ON mateh_agents(subdomain_agent) WHERE subdomain_agent IS NOT NULL;
-- Per-VPS port uniqueness — two agents on same VPS can't share a port.
CREATE UNIQUE INDEX IF NOT EXISTS mateh_agents_vps_port_unique
    ON mateh_agents(vps_instance_id, gateway_port) WHERE gateway_port IS NOT NULL;
-- Brand-slug per-VPS uniqueness — two agents on same VPS can't share a brand folder.
CREATE UNIQUE INDEX IF NOT EXISTS mateh_agents_vps_brand_unique
    ON mateh_agents(vps_instance_id, brand_slug);
