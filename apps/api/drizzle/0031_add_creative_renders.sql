-- Creative renders — every approved creative_final_draft spawns a row here.
-- Tracks fal.ai request lifecycle + final output URL on tenant VPS + cost.
-- Foundational for Phase B3 closed-loop learning: linked to brand_book version,
-- concept/character/scenes IDs, exact prompts — enables retrospective DNA tagging.

CREATE TABLE IF NOT EXISTS creative_renders (
    id                text PRIMARY KEY,
    instance_id       text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    output_id         text REFERENCES agent_outputs(id) ON DELETE SET NULL,
    -- approved creative_final_draft agent_output that triggered this render

    -- Lifecycle
    render_status     text NOT NULL DEFAULT 'queued',
    -- queued → rendering → uploading → compositing → done | failed
    queued_at         timestamptz NOT NULL DEFAULT now(),
    started_at        timestamptz,
    completed_at      timestamptz,
    duration_sec      integer,
    error_message     text,

    -- Request
    tier              text NOT NULL,        -- 'draft' | 'standard' | 'premium'
    format_type       text NOT NULL,        -- 'image' | 'video' | 'carousel' | 'audio'
    selected_model    text NOT NULL,        -- e.g. 'fal-ai/nano-banana-pro'
    fal_request_id    text,                 -- fal.ai's request ID (for polling/cancel)

    -- Links to previous gates (for lineage + remix)
    concept_id        text,
    character_ref_id  text,
    scenes_id         text,
    brand_book_version integer,

    -- Prompts used (exact strings sent to fal.ai, for reproducibility + DNA tagging)
    prompts           jsonb,                -- { scenes: [{prompt, negativePrompt, seed?}] }

    -- Output
    result_urls       jsonb,                -- raw fal.ai result URLs (may expire)
    final_url         text,                 -- stable URL on tenant VPS
    thumbnail_url     text,
    file_size_bytes   bigint,
    dimensions        jsonb,                -- { width, height }

    -- Overlay composition metadata (what we added on tenant VPS)
    overlay_applied   boolean DEFAULT false,
    logo_applied      boolean DEFAULT false,
    audio_applied     boolean DEFAULT false,
    upscale_applied   boolean DEFAULT false,
    subtitles_applied boolean DEFAULT false,

    -- Cost tracking
    estimated_cost_usd numeric(10, 4),
    actual_cost_usd    numeric(10, 4),      -- from fal.ai billing (when available)

    -- Future learning signal — user rating after seeing rendered output
    user_rating       integer,              -- 1-5 stars, null if not rated
    user_feedback     text,

    created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS creative_renders_instance_idx ON creative_renders(instance_id);
CREATE INDEX IF NOT EXISTS creative_renders_status_idx   ON creative_renders(instance_id, render_status);
CREATE INDEX IF NOT EXISTS creative_renders_output_idx   ON creative_renders(output_id);
CREATE INDEX IF NOT EXISTS creative_renders_queued_idx   ON creative_renders(render_status, queued_at)
    WHERE render_status IN ('queued', 'rendering', 'uploading', 'compositing');

-- Also add fal.ai + ElevenLabs API keys to instances (BYOK — separate from aiProviderKey
-- which is for Anthropic). Kept NULL until user saves via setupCreative.
ALTER TABLE instances
    ADD COLUMN IF NOT EXISTS fal_api_key          text,
    ADD COLUMN IF NOT EXISTS elevenlabs_api_key   text;
