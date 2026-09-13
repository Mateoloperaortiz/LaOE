CREATE TYPE "public"."sanction_kind" AS ENUM('WARNING', 'MINOR', 'MAJOR', 'SUSPENSION', 'OFFICE_BAN');--> statement-breakpoint
CREATE TABLE "sanction" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"committee_id" text,
	"kind" "sanction_kind" NOT NULL,
	"cause" text NOT NULL,
	"reference" text,
	"occurred_on" date NOT NULL,
	"suspended_from" date,
	"suspended_until" date,
	"expires_on" date NOT NULL,
	"issued_by_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" text,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanction_suspension_consistent" CHECK (("sanction"."suspended_from" is null) = ("sanction"."suspended_until" is null)),
	CONSTRAINT "sanction_suspension_ordered" CHECK ("sanction"."suspended_until" is null or "sanction"."suspended_until" >= "sanction"."suspended_from"),
	CONSTRAINT "sanction_expires_after" CHECK ("sanction"."expires_on" >= "sanction"."occurred_on"),
	CONSTRAINT "sanction_revoke_consistent" CHECK (("sanction"."revoked_at" is null) = ("sanction"."revoke_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "permanence_snapshot" ADD COLUMN "expulsion_warning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_issued_by_id_person_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_revoked_by_id_person_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanction_person_idx" ON "sanction" USING btree ("person_id","expires_on");--> statement-breakpoint
CREATE INDEX "sanction_term_idx" ON "sanction" USING btree ("term_id");