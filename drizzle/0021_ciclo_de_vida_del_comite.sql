ALTER TYPE "public"."committee_status" ADD VALUE 'ON_TRIAL';--> statement-breakpoint
ALTER TABLE "committee" ADD COLUMN "trial_starts_on" date;--> statement-breakpoint
ALTER TABLE "committee" ADD COLUMN "trial_ends_on" date;--> statement-breakpoint
ALTER TABLE "committee" ADD COLUMN "deactivated_on" date;--> statement-breakpoint
ALTER TABLE "membership_term" ADD COLUMN "report_as_veteran" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "committee" ADD CONSTRAINT "committee_trial_consistent" CHECK (("committee"."trial_starts_on" is null) = ("committee"."trial_ends_on" is null));--> statement-breakpoint
ALTER TABLE "committee" ADD CONSTRAINT "committee_trial_ordered" CHECK ("committee"."trial_ends_on" is null or "committee"."trial_ends_on" >= "committee"."trial_starts_on");