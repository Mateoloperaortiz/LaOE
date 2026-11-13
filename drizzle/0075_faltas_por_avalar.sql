CREATE TYPE "public"."sanction_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TABLE "sanction" ADD COLUMN "status" "sanction_status" DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanction" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sanction" ADD COLUMN "decided_by_id" text;--> statement-breakpoint
ALTER TABLE "sanction" ADD COLUMN "decided_as" text;--> statement-breakpoint
ALTER TABLE "sanction" ADD COLUMN "decision_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanction_status_idx" ON "sanction" USING btree ("status");--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_decided_as_known" CHECK ("sanction"."decided_as" is null or "sanction"."decided_as" in ('HOLDER', 'PRESIDENCY'));--> statement-breakpoint
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_pending_undecided" CHECK ("sanction"."status"::text <> 'PENDING' or ("sanction"."decided_at" is null and "sanction"."decided_by_id" is null));