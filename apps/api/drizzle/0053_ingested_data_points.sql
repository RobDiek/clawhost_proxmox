-- Phase 4.1 — Universal data ingestion table.
--
-- Layer-1 of the 4-layer paid architecture (Ingestion → Understanding →
-- Hypotheses → Verification). Every row of historical/live performance data
-- normalized to one canonical shape regardless of upstream (Meta CSV,
-- Google Ads CSV, GA4 export, GSC export, Looker PDF, OAuth pulls,
-- screenshot OCR, manual entry).
--
-- Why one table for all sources: hypothesis engine queries cross-source
-- (e.g. Meta CTR 5% vs Google Ads CTR 0.8% on same campaign theme), and
-- dedup/quality scoring stays uniform. Adapter-specific raw payload is
-- preserved in raw JSONB so a mapper bug can be re-applied without losing
-- the original data.

CREATE TABLE IF NOT EXISTS ingested_data_points (
    id                      BIGSERIAL PRIMARY KEY,
    instance_id             TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    agent_id                TEXT REFERENCES mateh_agents(id) ON DELETE SET NULL,

    -- Source provenance
    source_type             TEXT NOT NULL,
    source_mode             TEXT NOT NULL DEFAULT 'upload',
    ingestion_batch_id      TEXT,
    source_meta             JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Entity
    data_type               TEXT NOT NULL,
    entity_id               TEXT NOT NULL,
    entity_name             TEXT,
    platform                TEXT NOT NULL,

    -- Time window
    period_start            TIMESTAMPTZ NOT NULL,
    period_end              TIMESTAMPTZ NOT NULL,
    period_grain            TEXT NOT NULL DEFAULT 'day',

    -- Normalized metrics
    impressions             BIGINT,
    clicks                  BIGINT,
    spend_ils               NUMERIC(14, 4),
    source_currency         TEXT,
    fx_rate                 NUMERIC(12, 6),

    conversions             NUMERIC(14, 4),
    conversion_value_ils    NUMERIC(14, 4),

    video_views             BIGINT,
    engagements             BIGINT,
    reach                   BIGINT,
    frequency               NUMERIC(8, 4),

    position                NUMERIC(8, 4),

    -- Dimensions + raw
    dimensions              JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw                     JSONB,

    -- Quality / lifecycle
    quality_score           NUMERIC(4, 3) NOT NULL DEFAULT 0.500,
    flags                   TEXT[] DEFAULT ARRAY[]::TEXT[],
    fingerprint             TEXT NOT NULL,

    ingested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idp_instance_idx
    ON ingested_data_points (instance_id);
CREATE INDEX IF NOT EXISTS idp_agent_idx
    ON ingested_data_points (agent_id);
CREATE INDEX IF NOT EXISTS idp_instance_platform_period_idx
    ON ingested_data_points (instance_id, platform, period_start);
CREATE INDEX IF NOT EXISTS idp_instance_datatype_period_idx
    ON ingested_data_points (instance_id, data_type, period_start);
CREATE INDEX IF NOT EXISTS idp_entity_period_idx
    ON ingested_data_points (entity_id, period_start);
CREATE INDEX IF NOT EXISTS idp_batch_idx
    ON ingested_data_points (ingestion_batch_id);

-- Dedup constraint — same (instance, source_type, entity, period) overwrites
-- silently via UPSERT in the dataIngestion service.
ALTER TABLE ingested_data_points
    ADD CONSTRAINT idp_fingerprint_uniq UNIQUE (fingerprint);
