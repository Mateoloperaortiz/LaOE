CREATE TYPE "public"."wordle_status" AS ENUM('IN_PROGRESS', 'WON', 'LOST', 'EXPIRED');--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'WORDLE';--> statement-breakpoint
CREATE TABLE "wordle_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"request_id" text NOT NULL,
	"guess" text NOT NULL,
	"feedback" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wordle_attempt_ordinal_range" CHECK ("wordle_attempt"."ordinal" between 1 and 6),
	CONSTRAINT "wordle_attempt_guess_format" CHECK ("wordle_attempt"."guess" ~ '^[A-ZÑ]{5}$'),
	CONSTRAINT "wordle_attempt_feedback_length" CHECK (jsonb_typeof("wordle_attempt"."feedback") = 'array' and jsonb_array_length("wordle_attempt"."feedback") = 5)
);
--> statement-breakpoint
CREATE TABLE "wordle_game" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"day" date NOT NULL,
	"term_id" text NOT NULL,
	"answer" text NOT NULL,
	"dictionary_version" text NOT NULL,
	"rules_version" text NOT NULL,
	"status" "wordle_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wordle_game_answer_format" CHECK ("wordle_game"."answer" ~ '^[A-ZÑ]{5}$'),
	CONSTRAINT "wordle_game_completed_consistent" CHECK (("wordle_game"."status" = 'IN_PROGRESS') = ("wordle_game"."completed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "wordle_game_id" text;--> statement-breakpoint
ALTER TABLE "wordle_attempt" ADD CONSTRAINT "wordle_attempt_game_id_wordle_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."wordle_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordle_game" ADD CONSTRAINT "wordle_game_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordle_game" ADD CONSTRAINT "wordle_game_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wordle_attempt_game_ordinal_unique" ON "wordle_attempt" USING btree ("game_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "wordle_attempt_game_request_unique" ON "wordle_attempt" USING btree ("game_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wordle_game_person_day_unique" ON "wordle_game" USING btree ("person_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "wordle_game_answer_day_unique" ON "wordle_game" USING btree ("answer","day");--> statement-breakpoint
CREATE INDEX "wordle_game_term_idx" ON "wordle_game" USING btree ("term_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_wordle_game_id_wordle_game_id_fk" FOREIGN KEY ("wordle_game_id") REFERENCES "public"."wordle_game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_wordle_game_unique" ON "point_entry" USING btree ("wordle_game_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_wordle_consistent" CHECK (("point_entry"."kind"::text = 'WORDLE') = ("point_entry"."wordle_game_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_wordle_reward" CHECK ("point_entry"."kind"::text <> 'WORDLE' or "point_entry"."points" between 1 and 6);