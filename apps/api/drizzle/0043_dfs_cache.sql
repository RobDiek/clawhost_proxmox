-- Per-tenant DataForSEO response cache.
-- Avoids re-paying for the same query across re-runs of the same research stage.
-- TTLs vary by endpoint type (see services/research/dataforseo/cache.ts).
-- Cache key = sha256(instance_id + endpoint + params_hash) — ensures per-tenant
-- isolation: no tenant reads data another tenant paid for.

CREATE TABLE IF NOT EXISTS dfs_cache (
    cache_key   TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    endpoint    TEXT NOT NULL,
    response    JSONB NOT NULL,
    cost        TEXT,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Lookup pattern: most-recent valid entry for (instance, endpoint).
CREATE INDEX IF NOT EXISTS dfs_cache_instance_endpoint_idx
    ON dfs_cache(instance_id, endpoint);

-- Sweep pattern: expired-row cleanup (background job, eventual).
CREATE INDEX IF NOT EXISTS dfs_cache_expires_idx
    ON dfs_cache(expires_at);
