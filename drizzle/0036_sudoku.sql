CREATE TYPE "public"."sudoku_difficulty" AS ENUM('EASY', 'MEDIUM', 'HARD');--> statement-breakpoint
CREATE TYPE "public"."sudoku_status" AS ENUM('IN_PROGRESS', 'SOLVED', 'ABANDONED', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'SUDOKU';--> statement-breakpoint
CREATE TABLE "sudoku_run" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"day" date NOT NULL,
	"seed" text NOT NULL,
	"rules_version" text NOT NULL,
	"difficulty" "sudoku_difficulty" NOT NULL,
	"assisted" boolean NOT NULL,
	"givens" text NOT NULL,
	"solution" text NOT NULL,
	"status" "sudoku_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"start_request_id" text NOT NULL,
	"finish_request_id" text,
	"credited_at" timestamp with time zone,
	"credited_points" integer,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sudoku_run_seed_format" CHECK ("sudoku_run"."seed" ~ '^[0-9a-f]{16}$'),
	CONSTRAINT "sudoku_run_givens_format" CHECK ("sudoku_run"."givens" ~ '^[0-9]{81}$'),
	CONSTRAINT "sudoku_run_solution_format" CHECK ("sudoku_run"."solution" ~ '^[1-9]{81}$'),
	CONSTRAINT "sudoku_run_finished_consistent" CHECK (("sudoku_run"."status" = 'IN_PROGRESS') = ("sudoku_run"."finished_at" is null)),
	CONSTRAINT "sudoku_run_finish_request_consistent" CHECK (("sudoku_run"."status" = 'SOLVED') = ("sudoku_run"."finish_request_id" is not null)),
	CONSTRAINT "sudoku_run_credit_consistent" CHECK (("sudoku_run"."credited_at" is null) = ("sudoku_run"."credited_points" is null)),
	CONSTRAINT "sudoku_run_credit_solved" CHECK ("sudoku_run"."credited_at" is null or "sudoku_run"."status" = 'SOLVED'),
	CONSTRAINT "sudoku_run_credit_range" CHECK ("sudoku_run"."credited_points" is null or "sudoku_run"."credited_points" between 1 and 6),
	CONSTRAINT "sudoku_run_credit_assisted_cap" CHECK ("sudoku_run"."credited_points" is null or not "sudoku_run"."assisted" or "sudoku_run"."credited_points" <= 3)
);
--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "sudoku_run_id" text;--> statement-breakpoint
ALTER TABLE "sudoku_run" ADD CONSTRAINT "sudoku_run_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sudoku_run" ADD CONSTRAINT "sudoku_run_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sudoku_run_person_day_credited_unique" ON "sudoku_run" USING btree ("person_id","day") WHERE "sudoku_run"."credited_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sudoku_run_person_open_unique" ON "sudoku_run" USING btree ("person_id") WHERE "sudoku_run"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE UNIQUE INDEX "sudoku_run_start_request_unique" ON "sudoku_run" USING btree ("person_id","start_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sudoku_run_finish_request_unique" ON "sudoku_run" USING btree ("person_id","finish_request_id") WHERE "sudoku_run"."finish_request_id" is not null;--> statement-breakpoint
CREATE INDEX "sudoku_run_person_day_idx" ON "sudoku_run" USING btree ("person_id","day");--> statement-breakpoint
CREATE INDEX "sudoku_run_term_idx" ON "sudoku_run" USING btree ("term_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_sudoku_run_id_sudoku_run_id_fk" FOREIGN KEY ("sudoku_run_id") REFERENCES "public"."sudoku_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_sudoku_run_unique" ON "point_entry" USING btree ("sudoku_run_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_sudoku_consistent" CHECK (("point_entry"."kind"::text = 'SUDOKU') = ("point_entry"."sudoku_run_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_sudoku_reward" CHECK ("point_entry"."kind"::text <> 'SUDOKU' or "point_entry"."points" between 1 and 6);