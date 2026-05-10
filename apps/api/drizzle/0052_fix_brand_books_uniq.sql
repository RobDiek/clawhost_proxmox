-- Phase 2.3.G follow-up — migration 0049 added a per-agent unique constraint
-- on brand_books but didn't drop two PRE-EXISTING constraints that block
-- multi-agent isolation:
--
--   1. brand_books_instance_version_uniq UNIQUE (instance_id, version)
--      → blocks secondary insert version=1 when primary already has version=1
--
--   2. brand_books_one_approved_per_instance UNIQUE (instance_id)
--      WHERE status='approved'
--      → blocks secondary approval when primary already has approved book
--
-- Both predate Phase 2.3 multi-MATEH and need to be widened to include
-- agent_id so each mateh_agent has its own version + approval lineage.

ALTER TABLE brand_books
    DROP CONSTRAINT IF EXISTS brand_books_instance_version_uniq;

DROP INDEX IF EXISTS brand_books_one_approved_per_instance;

-- Re-create as per-agent partial unique. NULLs in agent_id are treated as
-- distinct by PostgreSQL, so legacy rows (no mateh_agents link) won't
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS brand_books_one_approved_per_agent
    ON brand_books (instance_id, agent_id)
    WHERE status = 'approved';
