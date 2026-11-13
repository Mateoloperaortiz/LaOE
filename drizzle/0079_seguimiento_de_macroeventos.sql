CREATE TABLE "edition_follow_up" (
	"edition_id" text PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"closed_by_id" text
);
--> statement-breakpoint
ALTER TABLE "edition_follow_up" ADD CONSTRAINT "edition_follow_up_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_follow_up" ADD CONSTRAINT "edition_follow_up_closed_by_id_person_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;