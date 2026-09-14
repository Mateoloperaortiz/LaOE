ALTER TYPE "public"."recognition_kind" ADD VALUE 'OE_AWARD';--> statement-breakpoint
ALTER TYPE "public"."occasion_category" ADD VALUE 'INDUCTION';--> statement-breakpoint
ALTER TABLE "recognition" ADD COLUMN "award" text;--> statement-breakpoint
ALTER TABLE "membership_term" ADD COLUMN "academic_verified_on" date;--> statement-breakpoint
ALTER TABLE "membership_term" ADD COLUMN "academic_verified_by_id" text;--> statement-breakpoint
ALTER TABLE "membership_term" ADD CONSTRAINT "membership_term_academic_verified_by_id_person_id_fk" FOREIGN KEY ("academic_verified_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_award_consistent" CHECK (("recognition"."kind"::text = 'OE_AWARD') = ("recognition"."award" is not null));