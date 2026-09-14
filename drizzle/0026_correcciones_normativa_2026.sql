ALTER TABLE "membership" ADD COLUMN "leave_condition" jsonb;--> statement-breakpoint
ALTER TABLE "membership_term" ADD COLUMN "resumed_new" boolean DEFAULT false NOT NULL;