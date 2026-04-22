-- Phase H — bi-directional Telegram sync of the approval queue.
-- Per-instance secret token we pass to Telegram setWebhook and then verify
-- on every incoming callback_query via the X-Telegram-Bot-Api-Secret-Token
-- header. Protects /hosting/telegram/webhook/:id from unauth callers.

ALTER TABLE instances ADD COLUMN IF NOT EXISTS telegram_webhook_secret TEXT;
