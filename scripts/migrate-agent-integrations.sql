-- Agent Isolation: Create agent_integrations table and migrate existing data
-- Run on production: docker exec infra-postgres-1 psql -U openclaw -d openclaw -f /tmp/migrate.sql

BEGIN;

-- 1. Create table
CREATE TABLE IF NOT EXISTS agent_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(instance_id, agent_type, integration_type)
);

CREATE INDEX IF NOT EXISTS agent_int_instance_idx ON agent_integrations(instance_id);
CREATE INDEX IF NOT EXISTS agent_int_agent_idx ON agent_integrations(instance_id, agent_type);

-- 2. Migrate existing Telegram integrations
INSERT INTO agent_integrations (instance_id, agent_type, integration_type, config, status)
SELECT
  id,
  CASE
    WHEN selected_components::jsonb ? 'mt' THEN 'mt'
    WHEN selected_components::jsonb ? 'oc' THEN 'oc'
    ELSE 'bare'
  END,
  'telegram',
  jsonb_build_object(
    'botToken', telegram_bot_token,
    'chatId', telegram_chat_id
  ),
  'connected'
FROM instances
WHERE telegram_bot_token IS NOT NULL
ON CONFLICT (instance_id, agent_type, integration_type) DO NOTHING;

-- 3. Migrate existing Google integrations
INSERT INTO agent_integrations (instance_id, agent_type, integration_type, config, status)
SELECT
  id,
  CASE
    WHEN selected_components::jsonb ? 'mt' THEN 'mt'
    WHEN selected_components::jsonb ? 'oc' THEN 'oc'
    ELSE 'bare'
  END,
  'google',
  google_tokens,
  'connected'
FROM instances
WHERE google_tokens IS NOT NULL
ON CONFLICT (instance_id, agent_type, integration_type) DO NOTHING;

-- 4. Migrate existing Meta integrations
INSERT INTO agent_integrations (instance_id, agent_type, integration_type, config, status)
SELECT
  id,
  'mt',  -- Meta is always for MATEH
  'meta',
  meta_tokens,
  CASE WHEN (meta_tokens->>'status') = 'connected' THEN 'connected' ELSE 'pending' END
FROM instances
WHERE meta_tokens IS NOT NULL
ON CONFLICT (instance_id, agent_type, integration_type) DO NOTHING;

-- 5. Migrate existing Microsoft integrations
INSERT INTO agent_integrations (instance_id, agent_type, integration_type, config, status)
SELECT
  id,
  CASE
    WHEN selected_components::jsonb ? 'mt' THEN 'mt'
    WHEN selected_components::jsonb ? 'oc' THEN 'oc'
    ELSE 'bare'
  END,
  'microsoft',
  microsoft_tokens,
  'connected'
FROM instances
WHERE microsoft_tokens IS NOT NULL
ON CONFLICT (instance_id, agent_type, integration_type) DO NOTHING;

-- 6. Migrate API keys
INSERT INTO agent_integrations (instance_id, agent_type, integration_type, config, status)
SELECT
  id,
  CASE
    WHEN selected_components::jsonb ? 'mt' THEN 'mt'
    WHEN selected_components::jsonb ? 'oc' THEN 'oc'
    ELSE 'bare'
  END,
  'api_key',
  jsonb_build_object(
    'provider', COALESCE(ai_provider_type, 'anthropic'),
    'hasAnthropic', ai_provider_key IS NOT NULL,
    'hasOpenai', openai_api_key IS NOT NULL
  ),
  'connected'
FROM instances
WHERE ai_provider_key IS NOT NULL OR openai_api_key IS NOT NULL
ON CONFLICT (instance_id, agent_type, integration_type) DO NOTHING;

COMMIT;
