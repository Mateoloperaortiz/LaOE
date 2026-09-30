CREATE TYPE "public"."competition_support_role" AS ENUM('GRADER', 'OVERSEER', 'VAR');--> statement-breakpoint
CREATE TABLE "competition_support" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"base_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" "competition_support_role" NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition_support" ADD CONSTRAINT "competition_support_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_support" ADD CONSTRAINT "competition_support_base_id_competition_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."competition_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_support" ADD CONSTRAINT "competition_support_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_support" ADD CONSTRAINT "competition_support_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_support_base_person_unique" ON "competition_support" USING btree ("base_id","person_id");--> statement-breakpoint
CREATE INDEX "competition_support_person_idx" ON "competition_support" USING btree ("person_id");