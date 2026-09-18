CREATE TYPE "public"."game2048_status" AS ENUM('IN_PROGRESS', 'FINISHED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'GAME2048';--> statement-breakpoint
CREATE TABLE "game2048_run" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"day" date NOT NULL,
	"seed" text NOT NULL,
	"rules_version" text NOT NULL,
	"status" "game2048_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"start_request_id" text NOT NULL,
	"finish_request_id" text,
	"moves" text,
	"move_count" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"max_tile" integer DEFAULT 0 NOT NULL,
	"credited_at" timestamp with time zone,
	"credited_points" integer,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game2048_run_seed_format" CHECK ("game2048_run"."seed" ~ '^[0-9a-f]{16}$'),
	CONSTRAINT "game2048_run_moves_format" CHECK ("game2048_run"."moves" is null or ("game2048_run"."moves" ~ '^[UDLR]+$' and length("game2048_run"."moves") <= 4000)),
	CONSTRAINT "game2048_run_move_count_range" CHECK ("game2048_run"."move_count" between 0 and 4000),
	CONSTRAINT "game2048_run_move_count_matches" CHECK ("game2048_run"."moves" is null or "game2048_run"."move_count" = length("game2048_run"."moves")),
	CONSTRAINT "game2048_run_score_range" CHECK ("game2048_run"."score" >= 0 and "game2048_run"."max_tile" >= 0),
	CONSTRAINT "game2048_run_finished_consistent" CHECK (("game2048_run"."status" = 'IN_PROGRESS') = ("game2048_run"."finished_at" is null)),
	CONSTRAINT "game2048_run_credit_consistent" CHECK (("game2048_run"."credited_at" is null) = ("game2048_run"."credited_points" is null)),
	CONSTRAINT "game2048_run_credit_finished" CHECK ("game2048_run"."credited_at" is null or "game2048_run"."status" = 'FINISHED'),
	CONSTRAINT "game2048_run_credit_range" CHECK ("game2048_run"."credited_points" is null or "game2048_run"."credited_points" between 1 and 6)
);
--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "game2048_run_id" text;--> statement-breakpoint
ALTER TABLE "game2048_run" ADD CONSTRAINT "game2048_run_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game2048_run" ADD CONSTRAINT "game2048_run_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game2048_run_person_day_credited_unique" ON "game2048_run" USING btree ("person_id","day") WHERE "game2048_run"."credited_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "game2048_run_person_open_unique" ON "game2048_run" USING btree ("person_id") WHERE "game2048_run"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE UNIQUE INDEX "game2048_run_start_request_unique" ON "game2048_run" USING btree ("person_id","start_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game2048_run_finish_request_unique" ON "game2048_run" USING btree ("person_id","finish_request_id") WHERE "game2048_run"."finish_request_id" is not null;--> statement-breakpoint
CREATE INDEX "game2048_run_person_day_idx" ON "game2048_run" USING btree ("person_id","day");--> statement-breakpoint
CREATE INDEX "game2048_run_term_idx" ON "game2048_run" USING btree ("term_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_game2048_run_id_game2048_run_id_fk" FOREIGN KEY ("game2048_run_id") REFERENCES "public"."game2048_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_game2048_run_unique" ON "point_entry" USING btree ("game2048_run_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_game2048_consistent" CHECK (("point_entry"."kind"::text = 'GAME2048') = ("point_entry"."game2048_run_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_game2048_reward" CHECK ("point_entry"."kind"::text <> 'GAME2048' or "point_entry"."points" between 1 and 6);