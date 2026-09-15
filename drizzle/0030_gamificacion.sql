CREATE TYPE "public"."badge_family" AS ENUM('EN_PARCHE', 'EXPLORADOR', 'RELAMPAGO', 'PALABRA_A_PALABRA', 'SPECIAL');--> statement-breakpoint
CREATE TYPE "public"."boost_campaign_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."booster_item_status" AS ENUM('AVAILABLE', 'RESERVED', 'CONSUMED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."booster_kind" AS ENUM('PLUS_50', 'PLUS_100');--> statement-breakpoint
CREATE TYPE "public"."challenge_audience" AS ENUM('ALL', 'NEW', 'VETERAN', 'COMMITTEES');--> statement-breakpoint
CREATE TYPE "public"."challenge_kind" AS ENUM('PRESENTIAL', 'TRIVIA', 'EVIDENCE');--> statement-breakpoint
CREATE TYPE "public"."challenge_participation_status" AS ENUM('PENDING', 'COMPLETED', 'REJECTED', 'ANNULLED');--> statement-breakpoint
CREATE TYPE "public"."challenge_status" AS ENUM('DRAFT', 'PUBLISHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."evidence_file_status" AS ENUM('PENDING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_mode" AS ENUM('DRY_RUN', 'APPLY');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."reward_source" AS ENUM('CHALLENGE', 'CHECKIN');--> statement-breakpoint
CREATE TYPE "public"."reward_status" AS ENUM('RESERVED', 'GRANTED', 'RELEASED', 'REVERSED');--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'CHALLENGE';--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'BOOST';--> statement-breakpoint
CREATE TABLE "achievement" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"term_id" text,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"historical" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone,
	"featured_position" integer,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_featured_range" CHECK ("achievement"."featured_position" is null or "achievement"."featured_position" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "badge_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"family" "badge_family" NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"threshold" integer,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unlock_hint" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"special_challenge_id" text,
	"special_occasion_id" text,
	"term_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_definition_level_range" CHECK ("badge_definition"."level" between 1 and 3),
	CONSTRAINT "badge_definition_special_threshold" CHECK (("badge_definition"."family" = 'SPECIAL') = ("badge_definition"."threshold" is null)),
	CONSTRAINT "badge_definition_special_target" CHECK ("badge_definition"."family" <> 'SPECIAL' or ("badge_definition"."special_challenge_id" is not null) <> ("badge_definition"."special_occasion_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "badge_reconciliation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" "reconciliation_mode" NOT NULL,
	"status" "reconciliation_status" DEFAULT 'RUNNING' NOT NULL,
	"cursor" text,
	"processed" integer DEFAULT 0 NOT NULL,
	"unlocked" integer DEFAULT 0 NOT NULL,
	"revoked" integer DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_by_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boost_campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"name" text NOT NULL,
	"percent" integer NOT NULL,
	"challenge_id" text,
	"occasion_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "boost_campaign_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by_id" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_campaign_percent" CHECK ("boost_campaign"."percent" in (25, 50, 100)),
	CONSTRAINT "boost_campaign_single_target" CHECK (("boost_campaign"."challenge_id" is null) <> ("boost_campaign"."occasion_id" is null)),
	CONSTRAINT "boost_campaign_window_ordered" CHECK ("boost_campaign"."starts_at" < "boost_campaign"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "booster_item" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"kind" "booster_kind" NOT NULL,
	"status" "booster_item_status" DEFAULT 'AVAILABLE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"source_achievement_id" text,
	"target_challenge_id" text,
	"target_occasion_id" text,
	"consumed_reward_id" text,
	"granted_by_id" text,
	"grant_reason" text,
	"revoked_by_id" text,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booster_item_single_target" CHECK (not ("booster_item"."target_challenge_id" is not null and "booster_item"."target_occasion_id" is not null)),
	CONSTRAINT "booster_item_revoked_consistent" CHECK (("booster_item"."status" = 'REVOKED') = ("booster_item"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "challenge" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"kind" "challenge_kind" NOT NULL,
	"status" "challenge_status" DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audience" "challenge_audience" DEFAULT 'ALL' NOT NULL,
	"audience_committee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"base_points" integer DEFAULT 0 NOT NULL,
	"pass_percent" integer,
	"occasion_id" text,
	"published_at" timestamp with time zone,
	"published_by_id" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"duplicated_from_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_window_ordered" CHECK ("challenge"."opens_at" < "challenge"."closes_at"),
	CONSTRAINT "challenge_base_points_range" CHECK ("challenge"."base_points" between 0 and 20),
	CONSTRAINT "challenge_pass_percent_range" CHECK ("challenge"."pass_percent" is null or "challenge"."pass_percent" between 1 and 100),
	CONSTRAINT "challenge_trivia_pass_percent" CHECK (("challenge"."kind" = 'TRIVIA') = ("challenge"."pass_percent" is not null)),
	CONSTRAINT "challenge_presential_occasion" CHECK (("challenge"."kind" = 'PRESENTIAL') = ("challenge"."occasion_id" is not null)),
	CONSTRAINT "challenge_committees_nonempty" CHECK ("challenge"."audience" <> 'COMMITTEES' or (jsonb_typeof("challenge"."audience_committee_ids") = 'array' and jsonb_array_length("challenge"."audience_committee_ids") > 0)),
	CONSTRAINT "challenge_cancel_reason" CHECK (("challenge"."status" = 'CANCELLED') = ("challenge"."cancel_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "challenge_evidence_file" (
	"id" text PRIMARY KEY NOT NULL,
	"participation_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"status" "evidence_file_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_evidence_ordinal_range" CHECK ("challenge_evidence_file"."ordinal" between 1 and 3),
	CONSTRAINT "challenge_evidence_object_key_format" CHECK ("challenge_evidence_file"."object_key" ~ '^evidence/[a-z0-9]{10,40}/[a-z0-9]{10,40}\.(jpg|png|webp)$')
);
--> statement-breakpoint
CREATE TABLE "challenge_participation" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"person_id" text NOT NULL,
	"status" "challenge_participation_status" DEFAULT 'PENDING' NOT NULL,
	"request_id" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answers" jsonb,
	"score" integer,
	"passed" boolean,
	"evidence_text" text,
	"check_in_id" text,
	"reward_id" text,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_participation_reason" CHECK ("challenge_participation"."status" <> 'REJECTED' or "challenge_participation"."reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "challenge_question" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_question_ordinal_range" CHECK ("challenge_question"."ordinal" between 1 and 5),
	CONSTRAINT "challenge_question_options_range" CHECK (jsonb_typeof("challenge_question"."options") = 'array' and jsonb_array_length("challenge_question"."options") between 2 and 6),
	CONSTRAINT "challenge_question_correct_index" CHECK ("challenge_question"."correct_index" >= 0 and "challenge_question"."correct_index" < jsonb_array_length("challenge_question"."options"))
);
--> statement-breakpoint
CREATE TABLE "reward" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"source" "reward_source" NOT NULL,
	"participation_id" text,
	"check_in_id" text,
	"base_points" integer NOT NULL,
	"personal_percent" integer DEFAULT 0 NOT NULL,
	"campaign_percent" integer DEFAULT 0 NOT NULL,
	"campaign_id" text,
	"booster_item_id" text,
	"base_granted" integer NOT NULL,
	"extra_points" integer NOT NULL,
	"status" "reward_status" DEFAULT 'RESERVED' NOT NULL,
	"day_key" date NOT NULL,
	"week_key" date NOT NULL,
	"cap_daily" integer NOT NULL,
	"cap_weekly" integer NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_challenge_source" CHECK (("reward"."source" = 'CHALLENGE') = ("reward"."participation_id" is not null)),
	CONSTRAINT "reward_checkin_source" CHECK (("reward"."source" = 'CHECKIN') = ("reward"."check_in_id" is not null)),
	CONSTRAINT "reward_base_points_range" CHECK ("reward"."base_points" between 0 and 20),
	CONSTRAINT "reward_personal_percent" CHECK ("reward"."personal_percent" in (0, 50, 100)),
	CONSTRAINT "reward_campaign_percent" CHECK ("reward"."campaign_percent" in (0, 25, 50, 100)),
	CONSTRAINT "reward_base_granted_range" CHECK ("reward"."base_granted" between 0 and "reward"."base_points"),
	CONSTRAINT "reward_extra_nonnegative" CHECK ("reward"."extra_points" >= 0),
	CONSTRAINT "reward_reserved_consistent" CHECK (("reward"."status" = 'RESERVED') = ("reward"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "reward_id" text;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_badge_id_badge_definition_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge_definition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_definition" ADD CONSTRAINT "badge_definition_special_challenge_id_challenge_id_fk" FOREIGN KEY ("special_challenge_id") REFERENCES "public"."challenge"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_definition" ADD CONSTRAINT "badge_definition_special_occasion_id_occasion_id_fk" FOREIGN KEY ("special_occasion_id") REFERENCES "public"."occasion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_definition" ADD CONSTRAINT "badge_definition_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_definition" ADD CONSTRAINT "badge_definition_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_reconciliation_run" ADD CONSTRAINT "badge_reconciliation_run_started_by_id_person_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boost_campaign" ADD CONSTRAINT "boost_campaign_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_source_achievement_id_achievement_id_fk" FOREIGN KEY ("source_achievement_id") REFERENCES "public"."achievement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_target_challenge_id_challenge_id_fk" FOREIGN KEY ("target_challenge_id") REFERENCES "public"."challenge"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_target_occasion_id_occasion_id_fk" FOREIGN KEY ("target_occasion_id") REFERENCES "public"."occasion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_consumed_reward_id_reward_id_fk" FOREIGN KEY ("consumed_reward_id") REFERENCES "public"."reward"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_granted_by_id_person_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booster_item" ADD CONSTRAINT "booster_item_revoked_by_id_person_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_published_by_id_person_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_duplicated_from_id_challenge_id_fk" FOREIGN KEY ("duplicated_from_id") REFERENCES "public"."challenge"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_evidence_file" ADD CONSTRAINT "challenge_evidence_file_participation_id_challenge_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."challenge_participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participation" ADD CONSTRAINT "challenge_participation_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participation" ADD CONSTRAINT "challenge_participation_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participation" ADD CONSTRAINT "challenge_participation_check_in_id_check_in_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_in"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participation" ADD CONSTRAINT "challenge_participation_reward_id_reward_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."reward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participation" ADD CONSTRAINT "challenge_participation_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_question" ADD CONSTRAINT "challenge_question_challenge_id_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_participation_id_challenge_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."challenge_participation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_check_in_id_check_in_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_in"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_campaign_id_boost_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."boost_campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_booster_item_id_booster_item_id_fk" FOREIGN KEY ("booster_item_id") REFERENCES "public"."booster_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_person_badge_unique" ON "achievement" USING btree ("person_id","badge_id") WHERE "achievement"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_featured_unique" ON "achievement" USING btree ("person_id","featured_position") WHERE "achievement"."featured_position" is not null;--> statement-breakpoint
CREATE INDEX "achievement_person_idx" ON "achievement" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "badge_definition_code_unique" ON "badge_definition" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "badge_definition_family_level_unique" ON "badge_definition" USING btree ("family","level") WHERE "badge_definition"."family" <> 'SPECIAL';--> statement-breakpoint
CREATE INDEX "boost_campaign_challenge_idx" ON "boost_campaign" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "boost_campaign_occasion_idx" ON "boost_campaign" USING btree ("occasion_id");--> statement-breakpoint
CREATE INDEX "boost_campaign_term_idx" ON "boost_campaign" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booster_item_source_achievement_unique" ON "booster_item" USING btree ("source_achievement_id") WHERE "booster_item"."source_achievement_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booster_item_person_challenge_unique" ON "booster_item" USING btree ("person_id","target_challenge_id") WHERE "booster_item"."target_challenge_id" is not null and "booster_item"."status" <> 'REVOKED';--> statement-breakpoint
CREATE UNIQUE INDEX "booster_item_person_occasion_unique" ON "booster_item" USING btree ("person_id","target_occasion_id") WHERE "booster_item"."target_occasion_id" is not null and "booster_item"."status" <> 'REVOKED';--> statement-breakpoint
CREATE INDEX "booster_item_person_status_idx" ON "booster_item" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "challenge_term_status_idx" ON "challenge" USING btree ("term_id","status");--> statement-breakpoint
CREATE INDEX "challenge_occasion_idx" ON "challenge" USING btree ("occasion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_evidence_object_key_unique" ON "challenge_evidence_file" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_evidence_ordinal_unique" ON "challenge_evidence_file" USING btree ("participation_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_participation_unique" ON "challenge_participation" USING btree ("challenge_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_participation_request_unique" ON "challenge_participation" USING btree ("challenge_id","request_id");--> statement-breakpoint
CREATE INDEX "challenge_participation_person_idx" ON "challenge_participation" USING btree ("person_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_question_ordinal_unique" ON "challenge_question" USING btree ("challenge_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_participation_unique" ON "reward" USING btree ("participation_id") WHERE "reward"."participation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reward_check_in_unique" ON "reward" USING btree ("check_in_id") WHERE "reward"."check_in_id" is not null;--> statement-breakpoint
CREATE INDEX "reward_person_day_idx" ON "reward" USING btree ("person_id","day_key");--> statement-breakpoint
CREATE INDEX "reward_person_week_idx" ON "reward" USING btree ("person_id","week_key");--> statement-breakpoint
CREATE INDEX "reward_term_status_idx" ON "reward" USING btree ("term_id","status");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_reward_id_reward_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."reward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_reward_kind_unique" ON "point_entry" USING btree ("reward_id","kind") WHERE "point_entry"."reward_id" is not null;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_reward_consistent" CHECK (("point_entry"."kind"::text in ('CHALLENGE', 'BOOST')) = ("point_entry"."reward_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_reward_range" CHECK ("point_entry"."kind"::text not in ('CHALLENGE', 'BOOST') or "point_entry"."points" between 1 and 20);
--> statement-breakpoint
-- Catálogo inicial de la colección (ADR-067; textos T-2473 a T-2481). GH cambia nombres desde el admin.
INSERT INTO "badge_definition" ("id", "code", "family", "level", "threshold", "name", "description", "unlock_hint") VALUES
  ('badge_en_parche_1', 'EN_PARCHE_1', 'EN_PARCHE', 1, 1, 'En parche', 'Asistencias aprobadas a actividades voluntarias', '1 asistencia'),
  ('badge_en_parche_2', 'EN_PARCHE_2', 'EN_PARCHE', 2, 5, 'En parche', 'Asistencias aprobadas a actividades voluntarias', '5 asistencias'),
  ('badge_en_parche_3', 'EN_PARCHE_3', 'EN_PARCHE', 3, 15, 'En parche', 'Asistencias aprobadas a actividades voluntarias', '15 asistencias'),
  ('badge_explorador_1', 'EXPLORADOR_1', 'EXPLORADOR', 1, 2, 'Explorador OE', 'Actividades de comités distintos', '2 comités'),
  ('badge_explorador_2', 'EXPLORADOR_2', 'EXPLORADOR', 2, 4, 'Explorador OE', 'Actividades de comités distintos', '4 comités'),
  ('badge_explorador_3', 'EXPLORADOR_3', 'EXPLORADOR', 3, 6, 'Explorador OE', 'Actividades de comités distintos', '6 comités'),
  ('badge_relampago_1', 'RELAMPAGO_1', 'RELAMPAGO', 1, 1, 'Relámpago', 'Retos relámpago completados', '1 reto'),
  ('badge_relampago_2', 'RELAMPAGO_2', 'RELAMPAGO', 2, 5, 'Relámpago', 'Retos relámpago completados', '5 retos'),
  ('badge_relampago_3', 'RELAMPAGO_3', 'RELAMPAGO', 3, 15, 'Relámpago', 'Retos relámpago completados', '15 retos'),
  ('badge_palabra_1', 'PALABRA_A_PALABRA_1', 'PALABRA_A_PALABRA', 1, 1, 'Palabra a palabra', 'Wordles resueltos', '1 Wordle'),
  ('badge_palabra_2', 'PALABRA_A_PALABRA_2', 'PALABRA_A_PALABRA', 2, 10, 'Palabra a palabra', 'Wordles resueltos', '10 Wordles'),
  ('badge_palabra_3', 'PALABRA_A_PALABRA_3', 'PALABRA_A_PALABRA', 3, 30, 'Palabra a palabra', 'Wordles resueltos', '30 Wordles')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_config" ("key", "value") VALUES
  ('gamification.enabled', 'false'),
  ('gamification.caps', '{"daily": 20, "weekly": 60}'),
  ('gamification.defaults', '{"trivia": 5, "presential": 10, "evidence": 10, "passPercent": 80}')
ON CONFLICT ("key") DO NOTHING;