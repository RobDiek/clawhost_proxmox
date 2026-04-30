-- Mark certain instances as the admin's own canary/master.
-- Master instances are tagged in the admin panel and are recommended
-- targets for testing upgrades before pushing to all clients.

ALTER TABLE instances
ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS instances_is_master_idx ON instances(is_master) WHERE is_master = TRUE;
