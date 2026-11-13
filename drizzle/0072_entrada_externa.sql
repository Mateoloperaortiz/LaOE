ALTER TABLE "edition_registration" ADD COLUMN "ticket_hash" text;--> statement-breakpoint
ALTER TABLE "edition_registration" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "edition_registration" ADD COLUMN "checked_in_by_id" text;--> statement-breakpoint
ALTER TABLE "edition_registration" ADD CONSTRAINT "edition_registration_checked_in_by_id_person_id_fk" FOREIGN KEY ("checked_in_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "edition_registration_ticket_unique" ON "edition_registration" USING btree ("ticket_hash") WHERE "edition_registration"."ticket_hash" is not null;