-- Phase B5 — Closed-Loop Learning
--
-- creative_performance: time-series daily metrics per render per platform.
--   Fed by creativePerformanceSync cron pulling Meta Ads Insights + Google Ads.
--   Joined to creative_renders.id via platform_creative_mappings.
--
-- platform_creative_mappings: manual mapping of our creative_renders.id to
--   platform-side creative IDs (Meta ad_id, Google Ads ad_asset_id, etc).
--   For MVP user attaches after publishing; later automated via publishing service.

CREATE TABLE IF NOT EXISTS creative_performance (
    id                  text PRIMARY KEY,
    instance_id         text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    render_id           text NOT NULL REFERENCES creative_renders(id) ON DELETE CASCADE,

    platform            text NOT NULL,        -- 'meta' | 'google_ads' | 'tiktok' | 'linkedin'
    platform_creative_id text NOT NULL,       -- ad_id on Meta / ad_group_ad_id on Google / etc
    measurement_date    date NOT NULL,        -- daily bucket — UTC by default
    measurement_window  text NOT NULL DEFAULT 'daily',  -- 'daily' | 'lifetime'

    -- Core metrics (present on all platforms)
    spend               numeric(12, 4)  DEFAULT 0,
    impressions         bigint          DEFAULT 0,
    clicks              bigint          DEFAULT 0,
    reach               bigint          DEFAULT 0,
    frequency           numeric(6, 3),
    ctr                 numeric(8, 5),           -- clicks / impressions
    cpc                 numeric(12, 4),          -- spend / clicks
    cpm                 numeric(12, 4),          -- spend / impressions * 1000
    currency            text DEFAULT 'ILS',

    -- Video-specific
    video_plays         bigint DEFAULT 0,         -- 3s views (Meta) / starts (Google)
    video_p25           bigint DEFAULT 0,
    video_p50           bigint DEFAULT 0,
    video_p75           bigint DEFAULT 0,
    video_p100          bigint DEFAULT 0,
    hook_rate           numeric(8, 5),           -- video_plays / impressions (thumbstop)
    hold_rate           numeric(8, 5),           -- video_p50 / video_plays (retention)

    -- Conversions (Meta Pixel + Google Ads conversions)
    conversions         numeric(12, 2) DEFAULT 0,
    conversion_value    numeric(12, 4) DEFAULT 0,
    roas                numeric(10, 4),          -- conversion_value / spend

    -- Platform-specific raw payload (for debugging + future fields)
    raw                 jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS creative_performance_day_uniq
    ON creative_performance(render_id, platform, platform_creative_id, measurement_date, measurement_window);
CREATE INDEX IF NOT EXISTS creative_performance_instance_idx
    ON creative_performance(instance_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS creative_performance_render_idx
    ON creative_performance(render_id, measurement_date DESC);


CREATE TABLE IF NOT EXISTS platform_creative_mappings (
    id                   text PRIMARY KEY,
    instance_id          text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    render_id            text NOT NULL REFERENCES creative_renders(id) ON DELETE CASCADE,

    platform             text NOT NULL,       -- 'meta' | 'google_ads' | 'tiktok' | 'linkedin'
    platform_creative_id text NOT NULL,       -- the ad_id / ad_group_ad_id
    platform_campaign_id text,                -- optional parent
    platform_account_id  text NOT NULL,       -- ad account (for API query routing)

    -- Context
    published_at         timestamptz,         -- when creative went live (manual or auto)
    published_by         text,                -- userId or 'automated'
    notes                text,

    -- Lifecycle — false when ad paused/deleted (used to skip perf sync)
    is_active            boolean DEFAULT true,
    last_synced_at       timestamptz,
    last_sync_error      text,

    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_creative_mappings_uniq
    ON platform_creative_mappings(instance_id, platform, platform_creative_id);
CREATE INDEX IF NOT EXISTS platform_creative_mappings_render_idx
    ON platform_creative_mappings(render_id);
CREATE INDEX IF NOT EXISTS platform_creative_mappings_active_idx
    ON platform_creative_mappings(instance_id, is_active)
    WHERE is_active = true;


-- Fatigue signals — time-series alerts for renders showing performance decay.
-- Populated by creativePerformanceSync analyzeFatigue() when thresholds cross.
-- When status='open', menateach picks up and drafts a creative_refresh_draft.
CREATE TABLE IF NOT EXISTS creative_fatigue_alerts (
    id               text PRIMARY KEY,
    instance_id      text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    render_id        text NOT NULL REFERENCES creative_renders(id) ON DELETE CASCADE,

    trigger_reason   text NOT NULL,       -- 'frequency_high' | 'ctr_drop' | 'cpm_spike'
    trigger_value    numeric(10, 3),      -- actual metric value
    trigger_threshold numeric(10, 3),     -- what threshold was crossed
    baseline_value   numeric(10, 3),      -- 7d or 14d baseline for comparison

    detected_at      timestamptz NOT NULL DEFAULT now(),
    status           text NOT NULL DEFAULT 'open',   -- 'open' | 'refresh_drafted' | 'dismissed'
    refresh_render_id text,                -- FK filled when menateach creates refresh
    dismissed_reason text,

    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creative_fatigue_alerts_open_idx
    ON creative_fatigue_alerts(instance_id, status)
    WHERE status = 'open';
