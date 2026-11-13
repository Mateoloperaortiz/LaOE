CREATE TYPE "public"."assembly_poll_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED');--> statement-breakpoint
CREATE TABLE "assembly_poll" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"secret" boolean DEFAULT false NOT NULL,
	"status" "assembly_poll_status" DEFAULT 'DRAFT' NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assembly_tally" (
	"poll_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assembly_voter" (
	"poll_id" text NOT NULL,
	"person_id" text NOT NULL,
	"option_index" integer
);
--> statement-breakpoint
ALTER TABLE "assembly_poll" ADD CONSTRAINT "assembly_poll_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_tally" ADD CONSTRAINT "assembly_tally_poll_id_assembly_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."assembly_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_voter" ADD CONSTRAINT "assembly_voter_poll_id_assembly_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."assembly_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_voter" ADD CONSTRAINT "assembly_voter_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assembly_poll_occasion_idx" ON "assembly_poll" USING btree ("occasion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assembly_poll_one_open_unique" ON "assembly_poll" USING btree ("occasion_id") WHERE "assembly_poll"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "assembly_tally_unique" ON "assembly_tally" USING btree ("poll_id","option_index");--> statement-breakpoint
CREATE UNIQUE INDEX "assembly_voter_unique" ON "assembly_voter" USING btree ("poll_id","person_id");