-- Idempotency stamp for the post-install welcome email. Set when
-- installComplete fires welcome-email send; prevents duplicate sends if
-- the VPS retries the install-complete callback (e.g. after transient
-- mgmt-server unavailability).

ALTER TABLE instances
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;
