-- Phase 4.1 Layer-1 hardening — attribution-aware schema.
--
-- Closes 5 correctness issues discovered in the architecture review:
--
--   #1 Attribution-blind cross-platform sums (Meta 7d-click+1d-view vs
--      Google 30d-data-driven vs GA4 data-driven). Without
--      attribution_window + attribution_model on every row, SUM(conversions)
--      cross-platform double-counts. Now each row carries its provenance.
--
--   #2 Conversion-event taxonomy collapse. "189 messaging_conversation_started"
--      and "12 purchases" were both stored as just `conversions=N`, losing the
--      event semantics critical for tCPA / tROAS targeting. Now each row
--      carries the event name; Hypothesis Engine + Smart Bidding decisions
--      can split per-event.
--
--   #4 Timezone ambiguity. period_start/end were TIMESTAMPTZ (UTC).
--      Meta IL accounts report in Asia/Jerusalem; "day 2026-03-15" differs
--      across systems by up to 23h. New `period_date_local` DATE column is
--      the source-of-truth calendar day in `account_tz`. period_start/end
--      stay TIMESTAMPTZ for hour-grain sources (future) but aggregators
--      prefer period_date_local for cross-source day comparisons.

ALTER TABLE ingested_data_points
    -- '7d_click_1d_view' (Meta default), '7d_click', '1d_view',
    -- '28d_click_1d_view', '30d_click' (Google Ads default), 'last_click',
    -- 'data_driven', 'unknown'. NULL means source didn't surface it
    -- (e.g. screenshot, generic CSV).
    ADD COLUMN attribution_window TEXT,
    -- 'last_click', 'first_click', 'linear', 'time_decay', 'position_based',
    -- 'data_driven', 'unknown'. Independent from window: Google can be
    -- 30d_click WITH data_driven model.
    ADD COLUMN attribution_model TEXT,
    -- Event name as the source reports it:
    --   Meta:   messaging_conversation_started | lead | purchase | offsite_conversion.fb_pixel_purchase | ...
    --   Google: conversions (all) | <conversion_action_name> if per-action export
    --   GA4:    <event_name>
    --   GSC:    NULL (organic, no conversion)
    -- One row per event_name × entity × period is the ideal grain; many
    -- exports collapse all events into one row — those keep event_name='all'.
    ADD COLUMN conversion_event_name TEXT,
    -- IANA tz of the source account. 'Asia/Jerusalem' for IL accounts.
    -- Set from paidProfile.timezone or hardcoded default per-mapper.
    ADD COLUMN account_tz TEXT,
    -- Calendar day in account_tz this row aggregates. ONLY populated when
    -- period_grain='day' OR period_grain='custom' spanning a single day.
    -- For multi-day rollups this stays NULL; aggregators must use the
    -- prorate-by-overlap-days strategy.
    ADD COLUMN period_date_local DATE;

CREATE INDEX IF NOT EXISTS idp_period_date_local_idx
    ON ingested_data_points (instance_id, platform, period_date_local)
    WHERE period_date_local IS NOT NULL;

CREATE INDEX IF NOT EXISTS idp_event_name_idx
    ON ingested_data_points (instance_id, conversion_event_name)
    WHERE conversion_event_name IS NOT NULL;
