-- ──────────────────────────────────────────────────────────────────────────
-- Admin panel: 2-tier auth (email OTP + TOTP) + audit log
-- Single admin: hello@flowmatic.co.il (whitelist enforced in middleware)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                  TEXT UNIQUE NOT NULL,
    totp_secret            TEXT,                    -- base32, set on first 2FA setup
    totp_setup_completed   BOOLEAN DEFAULT FALSE,
    last_login_at          TIMESTAMPTZ,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,                  -- SHA-256 of JWT, lookup index
    expires_at      TIMESTAMPTZ NOT NULL,           -- 12h hard expire
    ip              TEXT,
    user_agent      TEXT,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_sessions_token_idx ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);

-- Reuse otp_codes for the email step (same flow as clients)
-- but tagged with email='hello@flowmatic.co.il' which is the whitelist anchor.

CREATE TABLE IF NOT EXISTS admin_audit (
    id            BIGSERIAL PRIMARY KEY,
    admin_id      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,                    -- 'login', 'suspend_instance', 'terminate_instance', 'refund', 'ssh_command', etc.
    target_type   TEXT,                              -- 'instance', 'user', 'payment'
    target_id     TEXT,
    details       JSONB,
    ip            TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit(target_type, target_id);

-- Snapshot tracking for terminate-with-snapshot policy
CREATE TABLE IF NOT EXISTS admin_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     TEXT NOT NULL,
    hetzner_image_id BIGINT,
    reason          TEXT,                            -- 'pre-terminate', 'pre-upgrade', 'manual'
    expires_at      TIMESTAMPTZ,                     -- auto-cleanup after 7 days
    created_by      UUID REFERENCES admin_users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_snapshots_instance_idx ON admin_snapshots(instance_id);
