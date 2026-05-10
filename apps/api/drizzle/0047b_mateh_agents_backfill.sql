-- Phase 2.1 — backfill mateh_agents from existing instances.
--
-- For every existing instances row that has 'mt' or 'oc' in
-- selected_components AND status != 'terminated', create exactly one
-- mateh_agents row marked is_primary=TRUE. Copy all per-agent fields
-- from instances.* into the new row.
--
-- Brand slug derivation: prefer answers.brandName from research_data
-- (lowercased + slugified), else fall back to 'default'.
--
-- Idempotent: ON CONFLICT does nothing if a primary row already exists for
-- this VPS (one_primary_per_vps EXCLUDE constraint enforces).

DO $BACKFILL$
DECLARE
    rec RECORD;
    new_agent_id TEXT;
    derived_slug TEXT;
    derived_name TEXT;
    derived_type TEXT;
BEGIN
    FOR rec IN
        SELECT i.*, t.name AS tenant_name
        FROM instances i
        LEFT JOIN tenants t ON t.id = i.tenant_id
        WHERE i.status != 'terminated'
          AND (i.selected_components::jsonb ? 'mt' OR i.selected_components::jsonb ? 'oc')
    LOOP
        -- Skip if primary agent already exists for this VPS (idempotency).
        IF EXISTS (SELECT 1 FROM mateh_agents WHERE vps_instance_id = rec.id AND is_primary = TRUE) THEN
            CONTINUE;
        END IF;

        new_agent_id := 'mta_' || substring(rec.id, 1, 12);

        -- Brand slug from research_data.answers.brandName (lower-snake-case),
        -- else from businessName, else 'default'.
        derived_slug := COALESCE(
            lower(regexp_replace(
                COALESCE(
                    rec.research_data->'answers'->>'brandName',
                    rec.research_data->'answers'->>'businessName',
                    'default'
                ),
                '[^a-zA-Z0-9]+', '-', 'g'
            )),
            'default'
        );
        -- Trim leading/trailing dashes
        derived_slug := regexp_replace(derived_slug, '^-+|-+$', '', 'g');
        IF derived_slug = '' THEN
            derived_slug := 'default';
        END IF;

        derived_name := COALESCE(
            rec.research_data->'answers'->>'brandName',
            rec.research_data->'answers'->>'businessName',
            'Default'
        );

        -- Agent type: prefer 'mateh' if mt is in components, else 'oc'.
        derived_type := CASE
            WHEN rec.selected_components::jsonb ? 'mt' THEN 'mateh'
            WHEN rec.selected_components::jsonb ? 'oc' THEN 'oc'
            ELSE 'bare'
        END;

        INSERT INTO mateh_agents (
            id, vps_instance_id, tenant_id, agent_type, name, brand_slug,
            subdomain_agent, subdomain_flows, gateway_port,
            openclaw_token, automation_password,
            ai_provider_key, ai_provider_type, openai_api_key,
            fal_api_key, elevenlabs_api_key,
            dataforseo_key, firecrawl_key,
            sub_agent_models, google_tokens, meta_tokens, microsoft_tokens,
            gsc_tokens, github_config,
            telegram_chat_id, telegram_bot_token, telegram_webhook_secret,
            research_data, onboarding_step, onboarding_completed,
            schedules, status, last_health_report, last_health_at, auto_heal,
            is_primary, created_at
        ) VALUES (
            new_agent_id, rec.id, rec.tenant_id, derived_type, derived_name, derived_slug,
            rec.subdomain_agent, rec.subdomain_flows, 3000,
            rec.openclaw_token, rec.automation_password,
            rec.ai_provider_key, rec.ai_provider_type, rec.openai_api_key,
            rec.fal_api_key, rec.elevenlabs_api_key,
            rec.dataforseo_key, rec.firecrawl_key,
            rec.sub_agent_models, rec.google_tokens, rec.meta_tokens, rec.microsoft_tokens,
            rec.gsc_tokens, rec.github_config,
            rec.telegram_chat_id, rec.telegram_bot_token, rec.telegram_webhook_secret,
            rec.research_data, COALESCE(rec.onboarding_step, 0),
            COALESCE(rec.onboarding_completed, FALSE),
            rec.schedules, COALESCE(rec.status, 'running'),
            rec.last_health_report, rec.last_health_at,
            COALESCE(rec.auto_heal, TRUE),
            TRUE, COALESCE(rec.created_at, NOW())
        );
    END LOOP;
END
$BACKFILL$;

-- Diagnostic output
SELECT 'instances_active:' AS k, count(*)::TEXT AS v FROM instances WHERE status != 'terminated'
UNION ALL SELECT 'mateh_agents_total:', count(*)::TEXT FROM mateh_agents
UNION ALL SELECT 'mateh_agents_primary:', count(*)::TEXT FROM mateh_agents WHERE is_primary = TRUE
UNION ALL SELECT 'instances_active_with_agent:',
    count(DISTINCT i.id)::TEXT
    FROM instances i
    JOIN mateh_agents a ON a.vps_instance_id = i.id AND a.is_primary = TRUE
    WHERE i.status != 'terminated';
