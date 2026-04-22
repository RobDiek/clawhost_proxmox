ALTER TABLE "claws" RENAME TO "agents";
ALTER TABLE "pending_claws" RENAME TO "pending_agents";

ALTER TABLE "volumes" RENAME COLUMN "claw_id" TO "agent_id";