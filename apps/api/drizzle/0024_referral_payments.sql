ALTER TABLE "referrals" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
ALTER TABLE "referrals" DROP COLUMN IF EXISTS "earned_amount";--> statement-breakpoint
ALTER TABLE "pending_claws" ADD COLUMN "referral_code" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"referral_id" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"type" text DEFAULT 'purchase' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referral_payments" ADD CONSTRAINT "referral_payments_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_payments_referral_id_idx" ON "referral_payments" USING btree ("referral_id");