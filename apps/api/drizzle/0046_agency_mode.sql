-- Phase 1.5 — Agency mode flag on users.
-- When agency_mode_enabled = TRUE, the user gets full self-service tenant
-- management (create/edit/delete/assign tenants from their own dashboard).
-- When FALSE (default), the user sees the legacy single-tenant flow and
-- the dashboard's Tenants tab + filter + MIFKADA tab are all hidden.
--
-- Toggle is admin-only (via /admin/clients/:id/toggle-agency-mode). Users
-- cannot self-upgrade — Sergei flips the flag for clients he's identified
-- as agencies.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS agency_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS users_agency_mode_idx
    ON users(agency_mode_enabled) WHERE agency_mode_enabled = TRUE;