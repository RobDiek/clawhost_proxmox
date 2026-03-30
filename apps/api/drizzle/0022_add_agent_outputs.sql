CREATE TABLE "agent_outputs" (
	"id" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"agent_role" text NOT NULL,
	"output_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"media_url" text,
	"media_type" text,
	"media_meta" jsonb,
	"platform" text,
	"scheduled_for" timestamp with time zone,
	"metadata" jsonb,
	"status" text NOT NULL DEFAULT 'pending_review',
	"edited_content" text,
	"rejection_reason" text,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_outputs_instance_idx" ON "agent_outputs" USING btree ("instance_id");
--> statement-breakpoint
CREATE INDEX "agent_outputs_status_idx" ON "agent_outputs" USING btree ("instance_id", "status");
--> statement-breakpoint
CREATE INDEX "agent_outputs_scheduled_idx" ON "agent_outputs" USING btree ("instance_id", "scheduled_for");
--> statement-breakpoint
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE cascade ON UPDATE no action;
