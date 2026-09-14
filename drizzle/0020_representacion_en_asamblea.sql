CREATE TYPE "public"."representative_role" AS ENUM('TITULAR', 'SUPLENTE');--> statement-breakpoint
CREATE TABLE "committee_assembly_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"term_id" text NOT NULL,
	"represented" boolean DEFAULT false NOT NULL,
	"excused" boolean DEFAULT false NOT NULL,
	"represented_by_id" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee_representative" (
	"id" text PRIMARY KEY NOT NULL,
	"committee_id" text NOT NULL,
	"term_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" "representative_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "committee_assembly_attendance" ADD CONSTRAINT "committee_assembly_attendance_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_assembly_attendance" ADD CONSTRAINT "committee_assembly_attendance_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_assembly_attendance" ADD CONSTRAINT "committee_assembly_attendance_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_assembly_attendance" ADD CONSTRAINT "committee_assembly_attendance_represented_by_id_person_id_fk" FOREIGN KEY ("represented_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_representative" ADD CONSTRAINT "committee_representative_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_representative" ADD CONSTRAINT "committee_representative_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_representative" ADD CONSTRAINT "committee_representative_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "committee_assembly_attendance_unique" ON "committee_assembly_attendance" USING btree ("occasion_id","committee_id");--> statement-breakpoint
CREATE INDEX "committee_assembly_attendance_term_idx" ON "committee_assembly_attendance" USING btree ("term_id","committee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_representative_role_unique" ON "committee_representative" USING btree ("committee_id","term_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_representative_person_unique" ON "committee_representative" USING btree ("committee_id","term_id","person_id");