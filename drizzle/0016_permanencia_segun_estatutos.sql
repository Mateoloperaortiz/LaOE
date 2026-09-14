ALTER TYPE "public"."membership_end_reason" ADD VALUE 'EXPULSION' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."membership_end_reason" ADD VALUE 'STUDENT_STATUS_LOST' BEFORE 'OTHER';--> statement-breakpoint
DROP INDEX "membership_term_person_term_unique";--> statement-breakpoint
ALTER TABLE "membership_term" ADD COLUMN "committee_id" text;--> statement-breakpoint
ALTER TABLE "membership_term" ADD CONSTRAINT "membership_term_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_term_committee_unique" ON "membership_term" USING btree ("person_id","term_id","committee_id") WHERE "membership_term"."committee_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_term_person_term_unique" ON "membership_term" USING btree ("person_id","term_id") WHERE "membership_term"."committee_id" is null;--> statement-breakpoint
-- ADR-060 regla 1: la banda de prueba pasa a ser por condición (Est. art. 7.5, 8.3, 11.4 y 11.5).
INSERT INTO "app_config" ("key", "value") VALUES
  ('permanence.probationMargins', '{"active":20,"new":0,"probation":0,"transfer":0}'::jsonb)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
DELETE FROM "app_config" WHERE "key" = 'permanence.probationMargin';
