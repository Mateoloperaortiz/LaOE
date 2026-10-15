CREATE TYPE "public"."color_status" AS ENUM('IN_PROGRESS', 'FINISHED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'COLOR';--> statement-breakpoint
CREATE TABLE "color_run" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"day" date NOT NULL,
	"rules_version" text NOT NULL,
	"status" "color_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"start_request_id" text NOT NULL,
	"targets" jsonb NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"watch_started_at" timestamp with time zone NOT NULL,
	"next_round_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"average" numeric(4, 1),
	"credited_at" timestamp with time zone,
	"credited_points" integer,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "color_run_round_range" CHECK ("color_run"."round" between 1 and 3),
	CONSTRAINT "color_run_targets_length" CHECK (jsonb_typeof("color_run"."targets") = 'array' and jsonb_array_length("color_run"."targets") = 3),
	CONSTRAINT "color_run_results_length" CHECK (jsonb_typeof("color_run"."results") = 'array' and jsonb_array_length("color_run"."results") between 0 and 3),
	CONSTRAINT "color_run_finished_consistent" CHECK (("color_run"."status" = 'IN_PROGRESS') = ("color_run"."finished_at" is null)),
	CONSTRAINT "color_run_average_consistent" CHECK (("color_run"."status" = 'FINISHED') = ("color_run"."average" is not null)),
	CONSTRAINT "color_run_average_range" CHECK ("color_run"."average" is null or "color_run"."average" between 0 and 100),
	CONSTRAINT "color_run_credit_consistent" CHECK (("color_run"."credited_at" is null) = ("color_run"."credited_points" is null)),
	CONSTRAINT "color_run_credit_finished" CHECK ("color_run"."credited_at" is null or "color_run"."status" = 'FINISHED'),
	CONSTRAINT "color_run_credit_range" CHECK ("color_run"."credited_points" is null or "color_run"."credited_points" between 1 and 6)
);
--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "color_run_id" text;--> statement-breakpoint
ALTER TABLE "color_run" ADD CONSTRAINT "color_run_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_run" ADD CONSTRAINT "color_run_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "color_run_person_day_credited_unique" ON "color_run" USING btree ("person_id","day") WHERE "color_run"."credited_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "color_run_person_open_unique" ON "color_run" USING btree ("person_id") WHERE "color_run"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE UNIQUE INDEX "color_run_start_request_unique" ON "color_run" USING btree ("person_id","start_request_id");--> statement-breakpoint
CREATE INDEX "color_run_person_day_idx" ON "color_run" USING btree ("person_id","day");--> statement-breakpoint
CREATE INDEX "color_run_term_idx" ON "color_run" USING btree ("term_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_color_run_id_color_run_id_fk" FOREIGN KEY ("color_run_id") REFERENCES "public"."color_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_color_run_unique" ON "point_entry" USING btree ("color_run_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_color_consistent" CHECK (("point_entry"."kind"::text = 'COLOR') = ("point_entry"."color_run_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_color_reward" CHECK ("point_entry"."kind"::text <> 'COLOR' or "point_entry"."points" between 1 and 6);