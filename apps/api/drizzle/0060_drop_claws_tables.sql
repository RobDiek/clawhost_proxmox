-- Remove the legacy "claws" bare-VPS / self-serve OpenClaw hosting product.
-- This product is dead code inherited from the upstream clawhost fork: all five
-- tables are empty in production (0 rows, 0 Polar customers) and the live managed
-- product (instances / mateh_agents, AllPay) has no dependency on them.
--
-- Product direction (2026-06-09): managed agent only — no self-serve / bare VPS.
-- Backend controllers (controllers/claws, controllers/ssh-keys), routes, and the
-- claws Polar webhook handlers were removed in the same change. The license
-- Polar path (users.has_license) is unaffected; users.polar_customer_id is kept.
--
-- Safe to run online: tables are empty. CASCADE drops the intra-claws foreign
-- keys (claw_exports -> claws, volumes -> claws, claws/pending_claws -> ssh_keys).
-- No kept table references any of these. Idempotent via IF EXISTS.
DROP TABLE IF EXISTS claw_exports CASCADE;
DROP TABLE IF EXISTS volumes CASCADE;
DROP TABLE IF EXISTS claws CASCADE;
DROP TABLE IF EXISTS pending_claws CASCADE;
DROP TABLE IF EXISTS ssh_keys CASCADE;
