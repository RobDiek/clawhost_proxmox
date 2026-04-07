ALTER TABLE "claw_exports" DROP CONSTRAINT "claw_exports_claw_id_claws_id_fk";
--> statement-breakpoint
ALTER TABLE "claw_exports" ADD CONSTRAINT "claw_exports_claw_id_claws_id_fk" FOREIGN KEY ("claw_id") REFERENCES "public"."claws"("id") ON DELETE cascade ON UPDATE no action;