CREATE TYPE "public"."board_approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "candidacy_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"role_code" text NOT NULL,
	"status" "board_approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_id" text,
	"decided_as" text,
	"decision_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "candidacy_approval_decision" CHECK (("candidacy_approval"."status" = 'PENDING') = ("candidacy_approval"."decided_at" is null)),
	CONSTRAINT "candidacy_approval_authority" CHECK ("candidacy_approval"."decided_as" is null or "candidacy_approval"."decided_as" in ('HOLDER', 'PRESIDENCY'))
);
--> statement-breakpoint
ALTER TABLE "candidacy_approval" ADD CONSTRAINT "candidacy_approval_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidacy_approval" ADD CONSTRAINT "candidacy_approval_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidacy_approval" ADD CONSTRAINT "candidacy_approval_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidacy_approval" ADD CONSTRAINT "candidacy_approval_role_code_committee_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."committee_role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidacy_approval" ADD CONSTRAINT "candidacy_approval_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidacy_approval_live_unique" ON "candidacy_approval" USING btree ("person_id","term_id","committee_id","role_code") WHERE "candidacy_approval"."status" in ('PENDING', 'APPROVED');--> statement-breakpoint
CREATE INDEX "candidacy_approval_queue_idx" ON "candidacy_approval" USING btree ("term_id","status","requested_at");