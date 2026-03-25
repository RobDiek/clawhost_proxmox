ALTER TABLE "claws" RENAME COLUMN "hetzner_server_id" TO "provider_server_id";
--> statement-breakpoint
ALTER TABLE "claws" ADD COLUMN "provider" text DEFAULT 'hetzner' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ssh_keys" RENAME COLUMN "hetzner_key_id" TO "provider_key_id";
--> statement-breakpoint
ALTER TABLE "volumes" RENAME COLUMN "hetzner_volume_id" TO "provider_volume_id";
--> statement-breakpoint
ALTER TABLE "pending_claws" ADD COLUMN "provider" text DEFAULT 'hetzner' NOT NULL;