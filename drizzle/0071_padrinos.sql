CREATE TABLE "mentorship" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"mentee_id" text NOT NULL,
	"mentor_id" text NOT NULL,
	"assigned_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentorship_not_self" CHECK ("mentorship"."mentee_id" <> "mentorship"."mentor_id")
);
--> statement-breakpoint
ALTER TABLE "mentorship" ADD CONSTRAINT "mentorship_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship" ADD CONSTRAINT "mentorship_mentee_id_person_id_fk" FOREIGN KEY ("mentee_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship" ADD CONSTRAINT "mentorship_mentor_id_person_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship" ADD CONSTRAINT "mentorship_assigned_by_id_person_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentorship_term_mentee_unique" ON "mentorship" USING btree ("term_id","mentee_id");--> statement-breakpoint
CREATE INDEX "mentorship_mentor_idx" ON "mentorship" USING btree ("mentor_id","term_id");