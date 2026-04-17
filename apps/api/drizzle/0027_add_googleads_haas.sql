-- Migration: add Google Ads mode (self/managed) + HaaS tier to instances.
-- Supports 2 integration paths:
--   self: user's own OAuth + Developer Token + Customer ID
--   managed: Flowmatic's MCC parent account — auto-linked Customer ID (HaaS Silver/Gold only)

ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "google_ads_mode" text DEFAULT 'self';
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "google_ads_config" jsonb;
ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "haas_tier" text;

COMMENT ON COLUMN "instances"."google_ads_mode" IS 'self | managed';
COMMENT ON COLUMN "instances"."google_ads_config" IS '{ customerId, developerToken?, linkedAt?, mccSubAccountId? }';
COMMENT ON COLUMN "instances"."haas_tier" IS 'null | bronze | silver | gold';
