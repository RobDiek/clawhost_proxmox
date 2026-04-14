ALTER TABLE "instances" ADD COLUMN IF NOT EXISTS "schedules" jsonb DEFAULT '{}';
