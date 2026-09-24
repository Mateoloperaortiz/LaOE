CREATE TYPE "public"."competition_announcement_level" AS ENUM('INFO', 'WARNING', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."competition_base_kind" AS ENUM('NORMAL', 'MACRO');--> statement-breakpoint
CREATE TYPE "public"."competition_credit_kind" AS ENUM('GRANT', 'STAKE', 'PAYOUT', 'REFUND', 'ADJUSTMENT', 'REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."competition_market_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'RESOLVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."competition_matchup_source" AS ENUM('GENERATED', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."competition_outcome" AS ENUM('A_WIN', 'B_WIN', 'DRAW');--> statement-breakpoint
CREATE TYPE "public"."competition_point_kind" AS ENUM('MATCH', 'EXTRA', 'ADJUSTMENT', 'REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."competition_rotation_status" AS ENUM('PENDING', 'ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."competition_staff_role" AS ENUM('OPERATOR', 'JUDGE');--> statement-breakpoint
CREATE TYPE "public"."competition_status" AS ENUM('DRAFT', 'LIVE', 'FINISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."competition_team_status" AS ENUM('ACTIVE', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "competition" (
	"id" text PRIMARY KEY NOT NULL,
	"edition_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "competition_status" DEFAULT 'DRAFT' NOT NULL,
	"is_rehearsal" boolean DEFAULT false NOT NULL,
	"first_day_on" date,
	"second_day_on" date,
	"registration_form_id" text,
	"betting_enabled" boolean DEFAULT false NOT NULL,
	"starting_credits" integer,
	"allow_self_bet" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_slug_format" CHECK ("competition"."slug" ~ '^[a-z0-9-]{2,40}$'),
	CONSTRAINT "competition_starting_credits" CHECK ("competition"."starting_credits" is null or "competition"."starting_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "competition_announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"message" text NOT NULL,
	"level" "competition_announcement_level" DEFAULT 'INFO' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_announcement_length" CHECK (char_length("competition_announcement"."message") between 1 and 280)
);
--> statement-breakpoint
CREATE TABLE "competition_base" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"day" integer NOT NULL,
	"order_index" integer NOT NULL,
	"name" text NOT NULL,
	"kind" "competition_base_kind" DEFAULT 'NORMAL' NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_base_day" CHECK ("competition_base"."day" in (1, 2)),
	CONSTRAINT "competition_base_order" CHECK ("competition_base"."order_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "competition_bet" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"team_id" text NOT NULL,
	"pick_team_id" text NOT NULL,
	"stake" integer NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_bet_stake" CHECK ("competition_bet"."stake" > 0)
);
--> statement-breakpoint
CREATE TABLE "competition_credit_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"team_id" text NOT NULL,
	"kind" "competition_credit_kind" NOT NULL,
	"amount" integer NOT NULL,
	"bet_id" text,
	"reversal_of_id" text,
	"reason" text DEFAULT '' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_credit_entry_nonzero" CHECK ("competition_credit_entry"."amount" <> 0),
	CONSTRAINT "competition_credit_entry_sign" CHECK (("competition_credit_entry"."kind"::text in ('GRANT', 'PAYOUT', 'REFUND') and "competition_credit_entry"."amount" > 0) or ("competition_credit_entry"."kind"::text = 'STAKE' and "competition_credit_entry"."amount" < 0) or "competition_credit_entry"."kind"::text in ('ADJUSTMENT', 'REVERSAL')),
	CONSTRAINT "competition_credit_entry_bet" CHECK (("competition_credit_entry"."kind"::text in ('STAKE', 'PAYOUT', 'REFUND')) = ("competition_credit_entry"."bet_id" is not null)),
	CONSTRAINT "competition_credit_entry_reversal" CHECK (("competition_credit_entry"."kind"::text = 'REVERSAL') = ("competition_credit_entry"."reversal_of_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "competition_extra" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"name" text NOT NULL,
	"day" integer NOT NULL,
	"rubric_scale" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_extra_day" CHECK ("competition_extra"."day" in (1, 2)),
	CONSTRAINT "competition_extra_rubric_scale" CHECK ("competition_extra"."rubric_scale" is null or "competition_extra"."rubric_scale" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "competition_extra_criterion" (
	"id" text PRIMARY KEY NOT NULL,
	"extra_id" text NOT NULL,
	"name" text NOT NULL,
	"weight" integer NOT NULL,
	"order_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_extra_criterion_weight" CHECK ("competition_extra_criterion"."weight" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "competition_extra_score" (
	"id" text PRIMARY KEY NOT NULL,
	"criterion_id" text NOT NULL,
	"team_id" text NOT NULL,
	"score" integer NOT NULL,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_extra_score_range" CHECK ("competition_extra_score"."score" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "competition_market" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "competition_market_status" DEFAULT 'DRAFT' NOT NULL,
	"matchup_id" text,
	"closes_at" timestamp with time zone,
	"winner_team_id" text,
	"resolved_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_market_title_length" CHECK (char_length("competition_market"."title") between 1 and 120),
	CONSTRAINT "competition_market_resolved" CHECK (("competition_market"."status"::text in ('RESOLVED', 'CANCELLED')) = ("competition_market"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "competition_market_option" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"team_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_matchup" (
	"id" text PRIMARY KEY NOT NULL,
	"rotation_id" text NOT NULL,
	"base_id" text NOT NULL,
	"team_a_id" text NOT NULL,
	"team_b_id" text NOT NULL,
	"source" "competition_matchup_source" DEFAULT 'GENERATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_matchup_distinct" CHECK ("competition_matchup"."team_a_id" <> "competition_matchup"."team_b_id")
);
--> statement-breakpoint
CREATE TABLE "competition_point_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"team_id" text NOT NULL,
	"day" integer NOT NULL,
	"kind" "competition_point_kind" NOT NULL,
	"points" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"result_id" text,
	"extra_id" text,
	"reversal_of_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_point_entry_day" CHECK ("competition_point_entry"."day" in (1, 2)),
	CONSTRAINT "competition_point_entry_match" CHECK (("competition_point_entry"."kind"::text = 'MATCH') = ("competition_point_entry"."result_id" is not null)),
	CONSTRAINT "competition_point_entry_extra" CHECK (("competition_point_entry"."kind"::text = 'EXTRA') = ("competition_point_entry"."extra_id" is not null)),
	CONSTRAINT "competition_point_entry_reversal" CHECK (("competition_point_entry"."kind"::text = 'REVERSAL') = ("competition_point_entry"."reversal_of_id" is not null)),
	CONSTRAINT "competition_point_entry_reason" CHECK ("competition_point_entry"."kind"::text not in ('ADJUSTMENT', 'REVERSAL') or "competition_point_entry"."reason" <> '')
);
--> statement-breakpoint
CREATE TABLE "competition_result" (
	"id" text PRIMARY KEY NOT NULL,
	"matchup_id" text NOT NULL,
	"outcome" "competition_outcome" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"recorded_by_id" text,
	"superseded_at" timestamp with time zone,
	"supersede_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_rotation" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"day" integer NOT NULL,
	"number" integer NOT NULL,
	"status" "competition_rotation_status" DEFAULT 'PENDING' NOT NULL,
	"planned_seconds" integer NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"started_by_id" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_rotation_day" CHECK ("competition_rotation"."day" in (1, 2)),
	CONSTRAINT "competition_rotation_number" CHECK ("competition_rotation"."number" >= 1),
	CONSTRAINT "competition_rotation_planned" CHECK ("competition_rotation"."planned_seconds" between 60 and 14400),
	CONSTRAINT "competition_rotation_window" CHECK ("competition_rotation"."starts_at" is null or "competition_rotation"."ends_at" is null or "competition_rotation"."ends_at" > "competition_rotation"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "competition_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" "competition_staff_role" NOT NULL,
	"base_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_staff_judge_base" CHECK (("competition_staff"."role"::text = 'JUDGE') = ("competition_staff"."base_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "competition_team" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"status" "competition_team_status" DEFAULT 'ACTIVE' NOT NULL,
	"submission_id" text,
	"code_hash" text,
	"code_issued_at" timestamp with time zone,
	"code_failures" integer DEFAULT 0 NOT NULL,
	"code_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_team_number_range" CHECK ("competition_team"."number" between 1 and 99),
	CONSTRAINT "competition_team_name_length" CHECK (char_length("competition_team"."name") between 1 and 60),
	CONSTRAINT "competition_team_color_format" CHECK ("competition_team"."color" is null or "competition_team"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "competition_team_code_failures" CHECK ("competition_team"."code_failures" >= 0)
);
--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_registration_form_id_form_id_fk" FOREIGN KEY ("registration_form_id") REFERENCES "public"."form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_announcement" ADD CONSTRAINT "competition_announcement_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_announcement" ADD CONSTRAINT "competition_announcement_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_base" ADD CONSTRAINT "competition_base_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_bet" ADD CONSTRAINT "competition_bet_market_id_competition_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."competition_market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_bet" ADD CONSTRAINT "competition_bet_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_bet" ADD CONSTRAINT "competition_bet_pick_team_id_competition_team_id_fk" FOREIGN KEY ("pick_team_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_bet" ADD CONSTRAINT "competition_bet_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_credit_entry" ADD CONSTRAINT "competition_credit_entry_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_credit_entry" ADD CONSTRAINT "competition_credit_entry_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_credit_entry" ADD CONSTRAINT "competition_credit_entry_bet_id_competition_bet_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."competition_bet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_credit_entry" ADD CONSTRAINT "competition_credit_entry_reversal_of_id_competition_credit_entry_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."competition_credit_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_credit_entry" ADD CONSTRAINT "competition_credit_entry_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_extra" ADD CONSTRAINT "competition_extra_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_extra_criterion" ADD CONSTRAINT "competition_extra_criterion_extra_id_competition_extra_id_fk" FOREIGN KEY ("extra_id") REFERENCES "public"."competition_extra"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_extra_score" ADD CONSTRAINT "competition_extra_score_criterion_id_competition_extra_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."competition_extra_criterion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_extra_score" ADD CONSTRAINT "competition_extra_score_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_extra_score" ADD CONSTRAINT "competition_extra_score_recorded_by_id_person_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_market" ADD CONSTRAINT "competition_market_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_market" ADD CONSTRAINT "competition_market_matchup_id_competition_matchup_id_fk" FOREIGN KEY ("matchup_id") REFERENCES "public"."competition_matchup"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_market" ADD CONSTRAINT "competition_market_winner_team_id_competition_team_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_market" ADD CONSTRAINT "competition_market_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_market_option" ADD CONSTRAINT "competition_market_option_market_id_competition_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."competition_market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_market_option" ADD CONSTRAINT "competition_market_option_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matchup" ADD CONSTRAINT "competition_matchup_rotation_id_competition_rotation_id_fk" FOREIGN KEY ("rotation_id") REFERENCES "public"."competition_rotation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matchup" ADD CONSTRAINT "competition_matchup_base_id_competition_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."competition_base"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matchup" ADD CONSTRAINT "competition_matchup_team_a_id_competition_team_id_fk" FOREIGN KEY ("team_a_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matchup" ADD CONSTRAINT "competition_matchup_team_b_id_competition_team_id_fk" FOREIGN KEY ("team_b_id") REFERENCES "public"."competition_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_point_entry" ADD CONSTRAINT "competition_point_entry_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_point_entry" ADD CONSTRAINT "competition_point_entry_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_point_entry" ADD CONSTRAINT "competition_point_entry_result_id_competition_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."competition_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_point_entry" ADD CONSTRAINT "competition_point_entry_extra_id_competition_extra_id_fk" FOREIGN KEY ("extra_id") REFERENCES "public"."competition_extra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_point_entry" ADD CONSTRAINT "competition_point_entry_reversal_of_id_competition_point_entry_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."competition_point_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_point_entry" ADD CONSTRAINT "competition_point_entry_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_result" ADD CONSTRAINT "competition_result_matchup_id_competition_matchup_id_fk" FOREIGN KEY ("matchup_id") REFERENCES "public"."competition_matchup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_result" ADD CONSTRAINT "competition_result_recorded_by_id_person_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_rotation" ADD CONSTRAINT "competition_rotation_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_rotation" ADD CONSTRAINT "competition_rotation_started_by_id_person_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_staff" ADD CONSTRAINT "competition_staff_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_staff" ADD CONSTRAINT "competition_staff_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_staff" ADD CONSTRAINT "competition_staff_base_id_competition_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."competition_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_staff" ADD CONSTRAINT "competition_staff_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_team" ADD CONSTRAINT "competition_team_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_team" ADD CONSTRAINT "competition_team_submission_id_form_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_slug_unique" ON "competition" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "competition_edition_idx" ON "competition" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "competition_announcement_active_idx" ON "competition_announcement" USING btree ("competition_id","active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_base_order_unique" ON "competition_base" USING btree ("competition_id","day","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_base_name_unique" ON "competition_base" USING btree ("competition_id","day",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "competition_bet_team_unique" ON "competition_bet" USING btree ("market_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_credit_entry_bet_kind_unique" ON "competition_credit_entry" USING btree ("bet_id","kind") WHERE "competition_credit_entry"."bet_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_credit_entry_grant_unique" ON "competition_credit_entry" USING btree ("competition_id","team_id") WHERE "competition_credit_entry"."kind" = 'GRANT';--> statement-breakpoint
CREATE UNIQUE INDEX "competition_credit_entry_reversal_unique" ON "competition_credit_entry" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "competition_credit_entry_team_idx" ON "competition_credit_entry" USING btree ("competition_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_extra_name_unique" ON "competition_extra" USING btree ("competition_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "competition_extra_criterion_order_unique" ON "competition_extra_criterion" USING btree ("extra_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_extra_score_unique" ON "competition_extra_score" USING btree ("criterion_id","team_id");--> statement-breakpoint
CREATE INDEX "competition_extra_score_team_idx" ON "competition_extra_score" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "competition_market_competition_idx" ON "competition_market" USING btree ("competition_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_market_option_unique" ON "competition_market_option" USING btree ("market_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_matchup_base_unique" ON "competition_matchup" USING btree ("rotation_id","base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_matchup_team_a_unique" ON "competition_matchup" USING btree ("rotation_id","team_a_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_matchup_team_b_unique" ON "competition_matchup" USING btree ("rotation_id","team_b_id");--> statement-breakpoint
CREATE INDEX "competition_matchup_team_a_idx" ON "competition_matchup" USING btree ("team_a_id");--> statement-breakpoint
CREATE INDEX "competition_matchup_team_b_idx" ON "competition_matchup" USING btree ("team_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_point_entry_result_team_unique" ON "competition_point_entry" USING btree ("result_id","team_id") WHERE "competition_point_entry"."result_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_point_entry_reversal_unique" ON "competition_point_entry" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "competition_point_entry_team_idx" ON "competition_point_entry" USING btree ("competition_id","team_id");--> statement-breakpoint
CREATE INDEX "competition_point_entry_day_idx" ON "competition_point_entry" USING btree ("competition_id","day");--> statement-breakpoint
CREATE INDEX "competition_point_entry_extra_idx" ON "competition_point_entry" USING btree ("extra_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_result_current_unique" ON "competition_result" USING btree ("matchup_id") WHERE "competition_result"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "competition_result_matchup_idx" ON "competition_result" USING btree ("matchup_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_rotation_number_unique" ON "competition_rotation" USING btree ("competition_id","day","number");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_rotation_one_active" ON "competition_rotation" USING btree ("competition_id") WHERE "competition_rotation"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "competition_staff_operator_unique" ON "competition_staff" USING btree ("competition_id","person_id") WHERE "competition_staff"."base_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_staff_judge_unique" ON "competition_staff" USING btree ("base_id","person_id") WHERE "competition_staff"."base_id" is not null;--> statement-breakpoint
CREATE INDEX "competition_staff_person_idx" ON "competition_staff" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_team_number_unique" ON "competition_team" USING btree ("competition_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_team_name_unique" ON "competition_team" USING btree ("competition_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "competition_team_submission_unique" ON "competition_team" USING btree ("competition_id","submission_id") WHERE "competition_team"."submission_id" is not null;