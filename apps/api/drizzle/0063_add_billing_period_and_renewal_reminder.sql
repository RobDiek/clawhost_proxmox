-- S3 step 3 — annual renewal reminder support.
-- billing_period: 'monthly' (AllPay auto-recurs) | 'annual' (one-time yearly; no
--   AllPay auto-renew → we email a reminder before next_billing_at).
-- renewal_reminder_sent_at: idempotency stamp for the reminder cron (cleared on
--   the next successful payment so a renewed annual sub gets reminded again).
-- Applied MANUALLY via psql on the box (prod-deploy.sh does not run migrations).
ALTER TABLE instances ADD COLUMN IF NOT EXISTS billing_period text DEFAULT 'monthly';
ALTER TABLE instances ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at timestamptz;
