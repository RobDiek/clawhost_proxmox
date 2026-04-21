-- Phase M.1 — Content Plan Media
--
-- content_plan_media: media renders (image/video/voice) tied to content plan
--   items. Separate from creative_renders (which is the Ads B4 quality pipeline).
--
-- Storage model: files live on the CLIENT VPS at
--   /home/openclaw/.openclaw/media/{YYYY-MM}/{contentPlanItemId}/{variant}.{ext}
-- Served by nginx at https://agent.{id}.clawflow.flowmatic.co.il/media/...
-- Backed up via the existing `backup` add-on. Counts toward user's plan
-- storage quota (Personal 40GB / Business 80GB / Pro 160GB / Developer 240GB).

CREATE TABLE IF NOT EXISTS content_plan_media (
    id                      text PRIMARY KEY,
    instance_id             text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    content_plan_item_id    text NOT NULL,
    output_id               text REFERENCES agent_outputs(id) ON DELETE SET NULL,

    -- What
    render_type             text NOT NULL,                  -- 'image' | 'video' | 'voice' | 'composite'
    channel                 text NOT NULL,
    format_spec             jsonb,

    -- How (generation)
    model                   text NOT NULL,
    prompt                  text NOT NULL,
    negative_prompt         text,
    seed                    integer,
    brand_snapshot          jsonb,
    style_anchor            text,

    -- Where (storage on client VPS)
    vps_path                text,
    public_url              text,
    thumbnail_url           text,
    file_size_bytes         integer,

    -- Versioning
    version                 integer NOT NULL DEFAULT 1,
    parent_id               text,

    -- Review workflow
    status                  text NOT NULL DEFAULT 'queued',
    rejection_reason        text,
    user_prompt_edit        text,

    -- Brand consistency
    brand_score             integer,
    brand_score_breakdown   jsonb,

    -- Cost
    cost_usd                decimal(8, 4),

    -- Timestamps
    created_at              timestamp with time zone NOT NULL DEFAULT now(),
    generated_at            timestamp with time zone,
    approved_at             timestamp with time zone,
    approved_by             text
);

CREATE INDEX IF NOT EXISTS cpm_instance_idx ON content_plan_media (instance_id);
CREATE INDEX IF NOT EXISTS cpm_item_idx     ON content_plan_media (content_plan_item_id);
CREATE INDEX IF NOT EXISTS cpm_status_idx   ON content_plan_media (instance_id, status);
