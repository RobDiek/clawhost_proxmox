-- Creative references — competitor ads mined via Meta Ad Library + DNA-tagged.
-- Feeds Yotzer Gate 1 as few-shot context so generated concepts follow
-- winning patterns without copying.
--
-- Source types:
--   meta_ad_library  — scraped via Graph API ads_archive (Phase B3.1)
--   user_upload      — manually uploaded by client (future)
--   foreplay_import  — user-provided Foreplay JSON export (future)
--   our_winner       — own approved+rendered creative flagged as high-performer (Phase B5)

CREATE TABLE IF NOT EXISTS creative_references (
    id                text PRIMARY KEY,
    instance_id       text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,

    source            text NOT NULL,       -- 'meta_ad_library' | 'user_upload' | 'our_winner' | ...
    source_id         text,                -- Meta ad_archive_id / upload filename / creative_renders.id
    source_url        text,                -- ad library link, or media URL

    -- Discovery metadata
    competitor_name   text,                -- page name (Meta) or brand name
    country           text DEFAULT 'IL',
    first_seen_at     timestamptz,         -- delivery_start
    last_seen_at      timestamptz,         -- delivery_stop or now()
    days_active       integer,
    variation_count   integer,
    spend_range_min   integer,
    spend_range_max   integer,
    impressions_min   integer,
    impressions_max   integer,

    -- Creative content snapshot
    headline          text,
    body_text         text,
    cta_text          text,
    image_url         text,                -- captured image URL (may expire over time)
    video_thumb_url   text,                -- video thumbnail (for DNA decomposer)
    platforms         text[] DEFAULT '{}', -- ['facebook', 'instagram', ...]

    -- DNA tags (from creativeDNA.decomposeCreative)
    dna               jsonb,               -- CreativeDNA struct; null = not decomposed yet
    dna_computed_at   timestamptz,

    -- Ranking — higher score = more likely a "winner" to reference
    signal_score      numeric(10, 2),      -- daysActive * variationCount (spend proxy)

    -- Usage tracking — which Gate-1 drafts referenced this?
    used_in_drafts    jsonb DEFAULT '[]',  -- [{draftId, createdAt}]

    -- Lifecycle
    is_active         boolean DEFAULT true,  -- drops to false if Meta stops showing the ad
    last_checked_at   timestamptz,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creative_refs_instance_idx   ON creative_references(instance_id);
CREATE INDEX IF NOT EXISTS creative_refs_source_idx     ON creative_references(source, source_id);
CREATE INDEX IF NOT EXISTS creative_refs_signal_idx     ON creative_references(instance_id, signal_score DESC);
CREATE INDEX IF NOT EXISTS creative_refs_active_idx     ON creative_references(instance_id, is_active)
    WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS creative_refs_source_uniq
    ON creative_references(instance_id, source, source_id)
    WHERE source_id IS NOT NULL;
