-- Phase 3.6 — DataForSEO proxy + credits.
-- Flowmatic-managed master DFS account; per-tenant USD-cents balance debited
-- atomically per call at exact DFS-reported cost. AllPay tops up via webhook.
-- See memory: project_dfs_proxy.md for architecture.

-- ─── instances: per-tenant proxy fields ───────────────────────────────────
ALTER TABLE instances
    ADD COLUMN IF NOT EXISTS dataforseo_key_legacy            TEXT,
    ADD COLUMN IF NOT EXISTS dfs_balance_usd_cents            INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dfs_use_proxy                    BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS dfs_auto_topup_threshold_usd_cents  INTEGER,
    ADD COLUMN IF NOT EXISTS dfs_auto_topup_amount_usd_cents     INTEGER,
    ADD COLUMN IF NOT EXISTS dfs_monthly_cap_usd_cents        INTEGER,
    ADD COLUMN IF NOT EXISTS dfs_allpay_payment_token         TEXT;

-- ─── dfs_ledger: append-only audit of every credit/debit ──────────────────
CREATE TABLE IF NOT EXISTS dfs_ledger (
    id                BIGSERIAL PRIMARY KEY,
    instance_id       TEXT NOT NULL,
    kind              TEXT NOT NULL,           -- 'topup' | 'debit' | 'refund' | 'admin_credit' | 'auto_topup'
    amount_usd_cents  INTEGER NOT NULL,        -- + for credits, - for debits
    cost_usd_raw      TEXT,                    -- exact DFS cost in USD as string (debit only; sub-cent precision)
    endpoint          TEXT,                    -- DFS endpoint (debit only)
    cache_key         TEXT,                    -- dfs_cache.cache_key reference (debit only)
    allpay_order_id   TEXT,                    -- AllPay order reference (topup/auto_topup only)
    note              TEXT,                    -- free-text reason (admin_credit, refund)
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Lookup pattern: per-tenant ledger view, newest first.
CREATE INDEX IF NOT EXISTS dfs_ledger_instance_created_idx
    ON dfs_ledger(instance_id, created_at DESC);

-- Aggregation pattern: monthly debit sum + kind-filtered totals.
CREATE INDEX IF NOT EXISTS dfs_ledger_instance_kind_created_idx
    ON dfs_ledger(instance_id, kind, created_at DESC);

-- ─── system_config: runtime-mutable singleton-per-key config ──────────────
CREATE TABLE IF NOT EXISTS system_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed FX rate placeholder (cron will refresh; ~3.81 = market 3.70 × 1.029 AllPay-fee buffer).
INSERT INTO system_config (key, value) VALUES ('usd_to_ils_rate_with_fee', '3.81')
    ON CONFLICT (key) DO NOTHING;
