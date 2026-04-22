ALTER TABLE "claws" ADD COLUMN IF NOT EXISTS "agent_type" text NOT NULL DEFAULT 'openclaw';
ALTER TABLE "pending_claws" ADD COLUMN IF NOT EXISTS "agent_type" text NOT NULL DEFAULT 'openclaw';