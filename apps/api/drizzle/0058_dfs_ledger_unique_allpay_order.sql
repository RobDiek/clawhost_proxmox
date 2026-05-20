-- Phase 4.3-O H3: idempotency unique index on dfs_ledger.
-- Defends against webhook replay attacks where two concurrent POSTs with the
-- same allpay_order_id race past the SELECT idempotency check in credit()
-- (services/dfsCredits/ledger.ts). With this partial UNIQUE index, the second
-- INSERT errors out atomically.
--
-- Partial: only enforced when allpay_order_id is set. Debit rows (no order id)
-- and admin credits / refunds without order id are unaffected.
--
-- Safe to run online: CREATE UNIQUE INDEX scans the existing table once.
-- If duplicates exist (shouldn't, but possible from prior race), this will
-- fail loudly — operator must reconcile manually before retrying.
CREATE UNIQUE INDEX IF NOT EXISTS dfs_ledger_instance_allpay_order_uidx
    ON dfs_ledger (instance_id, allpay_order_id)
    WHERE allpay_order_id IS NOT NULL;
