-- Phase 1 — Multi-tenant architecture.
-- Introduces a "tenant" layer between User and Instance to support:
--   1. Agencies managing multiple clients on same VPS (Sergei's master case:
--      Flowmatic + ClientA's 3 MATEH all under one user but different tenants).
--   2. MIFKADA orchestrator (Phase 2) — operates at tenant scope.
--
-- Design:
--   - Each User has 1+ Tenants (auto-created "default" tenant on user creation
--     for legacy compatibility; admin can create additional).
--   - Each Instance belongs to exactly 1 Tenant.
--   - tenants.default_anthropic_key is a TENANT-LEVEL key that instances
--     fall back to when their own ai_provider_key is null. Per-instance
--     override remains the primary mechanism (existing behavior preserved).
--   - Resolution chain at runtime: instance.aiProviderKey → tenant.defaultAnthropicKey → null.
--
-- Backfill strategy:
--   - For every distinct user_id in instances, create a "default" tenant.
--   - Assign all of that user's instances to that default tenant.
--   - Existing per-instance ai_provider_key stays put — no data loss.
--
-- Admin can later: create new tenants, move instances between tenants,
-- set tenant-level default keys.

-- ─── tenants: client/portfolio grouping under a managing user ─────────────
CREATE TABLE IF NOT EXISTS tenants (
    id                          TEXT PRIMARY KEY,
    -- The User who OWNS / MANAGES this tenant. For Sergei's master:
    -- - "Flowmatic" tenant: managed_by_user_id = sergei
    -- - "ClientA" tenant: managed_by_user_id = sergei (he's managing for client)
    -- Future: a separate "client_user_id" for the actual client when we
    -- expose dashboards to managed clients.
    managed_by_user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    description                 TEXT,
    -- 'own'      = this is the managing user's own brand portfolio
    -- 'managed'  = this is a client of the managing user (agency case)
    kind                        TEXT NOT NULL DEFAULT 'own',
    -- Tenant-level default Anthropic key. Instances under this tenant fall
    -- back to this when instance.ai_provider_key is null. Allows agency to
    -- set one key for all client instances OR per-client keys per tenant.
    default_anthropic_key       TEXT,
    -- Tenant-level default OpenAI key (same fallback semantics).
    default_openai_key          TEXT,
    -- Phase 2 — MIFKADA scope flags. Default: only own-tenant view.
    mifkada_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    -- 'tenant'  = MIFKADA can see only this tenant's instances
    -- 'vps'     = MIFKADA can see all tenants on the same VPS (admin-gated;
    --             for Sergei's master holding-company view across Flowmatic
    --             + managed clients on same box).
    mifkada_scope               TEXT NOT NULL DEFAULT 'tenant',
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenants_managed_by_idx
    ON tenants(managed_by_user_id);
CREATE INDEX IF NOT EXISTS tenants_active_idx
    ON tenants(is_active) WHERE is_active = TRUE;

-- ─── instances: tenant assignment ─────────────────────────────────────────
ALTER TABLE instances
    ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS instances_tenant_id_idx
    ON instances(tenant_id) WHERE tenant_id IS NOT NULL;

-- ─── Backfill: create one default tenant per user, assign instances ───────
-- Uses a deterministic id based on user_id so re-running the migration is
-- safe. id = 'tn_default_<userid_first_12_chars>' — matches text PK.
DO $$
DECLARE
    rec RECORD;
    new_tenant_id TEXT;
BEGIN
    FOR rec IN
        SELECT DISTINCT u.id AS user_id, COALESCE(u.email, 'user') AS email
        FROM users u
        WHERE EXISTS (SELECT 1 FROM instances i WHERE i.user_id = u.id)
          OR u.is_admin = TRUE
    LOOP
        new_tenant_id := 'tn_def_' || substring(rec.user_id, 1, 16);

        INSERT INTO tenants (
            id, managed_by_user_id, name, kind, mifkada_enabled, mifkada_scope, is_active
        )
        VALUES (
            new_tenant_id,
            rec.user_id,
            'Default — ' || rec.email,
            'own',
            FALSE,
            'tenant',
            TRUE
        )
        ON CONFLICT (id) DO NOTHING;

        -- Assign all of this user's instances that don't already have a tenant
        UPDATE instances
        SET tenant_id = new_tenant_id
        WHERE user_id = rec.user_id
          AND tenant_id IS NULL;
    END LOOP;
END $$;
