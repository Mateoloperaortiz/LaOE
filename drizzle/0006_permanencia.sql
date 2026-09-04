CREATE TYPE "public"."recognition_kind" AS ENUM('MEMBER_OF_MONTH', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."permanence_applies_to" AS ENUM('ALL', 'NEW', 'VETERAN');--> statement-breakpoint
CREATE TYPE "public"."permanence_computation" AS ENUM('CHECKIN_COUNT', 'CHECKIN_THRESHOLD', 'CHECKIN_RATE', 'GROUP_EVALUATED', 'COMPOSITE', 'LEADER_SCORE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."permanence_decision_kind" AS ENUM('CONTINUES', 'PROBATION', 'EXIT_COMMITTEE', 'EXIT_OE');--> statement-breakpoint
CREATE TYPE "public"."permanence_scope" AS ENUM('GENERAL', 'COMMITTEE');--> statement-breakpoint
CREATE TYPE "public"."work_group_evaluation" AS ENUM('PENDING', 'GOOD', 'INSUFFICIENT');--> statement-breakpoint
CREATE TYPE "public"."work_group_kind" AS ENUM('WORK_COMMITTEE', 'GT_MACROEVENT', 'GAP', 'GAP_OE', 'BARRA_BRAVA', 'NEW_MEMBER_TASK');--> statement-breakpoint
CREATE TABLE "recognition" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"kind" "recognition_kind" DEFAULT 'MEMBER_OF_MONTH' NOT NULL,
	"committee_id" text,
	"term_id" text NOT NULL,
	"month" integer,
	"title" text NOT NULL,
	"announcement_id" text,
	"granted_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recognition_month_valid" CHECK ("recognition"."month" is null or ("recognition"."month" between 1 and 12)),
	CONSTRAINT "recognition_member_of_month_complete" CHECK ("recognition"."kind" <> 'MEMBER_OF_MONTH' or ("recognition"."committee_id" is not null and "recognition"."month" is not null))
);
--> statement-breakpoint
CREATE TABLE "leader_score" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"person_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"value" numeric(6, 2) NOT NULL,
	"note" text,
	"scored_by_id" text,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leader_score_value_nonnegative" CHECK ("leader_score"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "manual_credit" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"person_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"value" numeric(6, 2) NOT NULL,
	"reason" text NOT NULL,
	"granted_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_credit_value_nonnegative" CHECK ("manual_credit"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "permanence_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"person_id" text NOT NULL,
	"committee_id" text,
	"proposed" "permanence_decision_kind" NOT NULL,
	"decision" "permanence_decision_kind" NOT NULL,
	"reason" text,
	"decided_by_id" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permanence_decision_reason_when_changed" CHECK ("permanence_decision"."decision" = "permanence_decision"."proposed" or "permanence_decision"."reason" is not null),
	CONSTRAINT "permanence_decision_person_scope" CHECK ("permanence_decision"."committee_id" is not null or ("permanence_decision"."decision" in ('CONTINUES', 'EXIT_OE') and "permanence_decision"."proposed" in ('CONTINUES', 'EXIT_OE'))),
	CONSTRAINT "permanence_decision_committee_scope" CHECK ("permanence_decision"."committee_id" is null or ("permanence_decision"."decision" <> 'EXIT_OE' and "permanence_decision"."proposed" <> 'EXIT_OE'))
);
--> statement-breakpoint
CREATE TABLE "permanence_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"scope" "permanence_scope" NOT NULL,
	"committee_id" text,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"weight" numeric(6, 2) NOT NULL,
	"applies_to" "permanence_applies_to" DEFAULT 'ALL' NOT NULL,
	"computation" "permanence_computation" NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permanence_rule_key_format" CHECK ("permanence_rule"."key" ~ '^[a-z0-9-]{2,40}$'),
	CONSTRAINT "permanence_rule_weight_nonnegative" CHECK ("permanence_rule"."weight" >= 0),
	CONSTRAINT "permanence_rule_scope_consistent" CHECK (("permanence_rule"."scope" = 'COMMITTEE') = ("permanence_rule"."committee_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "permanence_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"person_id" text NOT NULL,
	"status" "membership_status" NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"probation" boolean DEFAULT false NOT NULL,
	"general_total" numeric(6, 2) DEFAULT 0 NOT NULL,
	"general_max" numeric(6, 2) DEFAULT 0 NOT NULL,
	"general" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"mandatory" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"frozen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permanence_table" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"scope" "permanence_scope" NOT NULL,
	"committee_id" text,
	"locked_at" timestamp with time zone,
	"locked_by_id" text,
	"comment" text,
	"commented_by_id" text,
	"commented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permanence_table_scope_consistent" CHECK (("permanence_table"."scope" = 'COMMITTEE') = ("permanence_table"."committee_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "work_group" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"kind" "work_group_kind" NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"edition_id" text,
	"event_id" text,
	"leader_person_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_group_code_format" CHECK ("work_group"."code" is null or "work_group"."code" ~ '^[A-Z0-9-]{2,20}$')
);
--> statement-breakpoint
CREATE TABLE "work_group_evaluator" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"person_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_group_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"person_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"evaluation" "work_group_evaluation" DEFAULT 'PENDING' NOT NULL,
	"evaluated_by_id" text,
	"evaluated_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_group_membership_evaluated_consistent" CHECK (("work_group_membership"."evaluation" = 'PENDING') = ("work_group_membership"."evaluated_at" is null))
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "committee_id" text;--> statement-breakpoint
ALTER TABLE "term" ADD COLUMN "permanence_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_announcement_id_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition" ADD CONSTRAINT "recognition_granted_by_id_person_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_score" ADD CONSTRAINT "leader_score_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_score" ADD CONSTRAINT "leader_score_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_score" ADD CONSTRAINT "leader_score_rule_id_permanence_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."permanence_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leader_score" ADD CONSTRAINT "leader_score_scored_by_id_person_id_fk" FOREIGN KEY ("scored_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_credit" ADD CONSTRAINT "manual_credit_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_credit" ADD CONSTRAINT "manual_credit_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_credit" ADD CONSTRAINT "manual_credit_rule_id_permanence_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."permanence_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_credit" ADD CONSTRAINT "manual_credit_granted_by_id_person_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_decision" ADD CONSTRAINT "permanence_decision_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_decision" ADD CONSTRAINT "permanence_decision_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_decision" ADD CONSTRAINT "permanence_decision_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_decision" ADD CONSTRAINT "permanence_decision_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_rule" ADD CONSTRAINT "permanence_rule_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_rule" ADD CONSTRAINT "permanence_rule_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_snapshot" ADD CONSTRAINT "permanence_snapshot_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_snapshot" ADD CONSTRAINT "permanence_snapshot_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_table" ADD CONSTRAINT "permanence_table_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_table" ADD CONSTRAINT "permanence_table_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_table" ADD CONSTRAINT "permanence_table_locked_by_id_person_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_table" ADD CONSTRAINT "permanence_table_commented_by_id_person_id_fk" FOREIGN KEY ("commented_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group" ADD CONSTRAINT "work_group_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group" ADD CONSTRAINT "work_group_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group" ADD CONSTRAINT "work_group_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group" ADD CONSTRAINT "work_group_leader_person_id_person_id_fk" FOREIGN KEY ("leader_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group" ADD CONSTRAINT "work_group_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group_evaluator" ADD CONSTRAINT "work_group_evaluator_group_id_work_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."work_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group_evaluator" ADD CONSTRAINT "work_group_evaluator_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group_membership" ADD CONSTRAINT "work_group_membership_group_id_work_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."work_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group_membership" ADD CONSTRAINT "work_group_membership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_group_membership" ADD CONSTRAINT "work_group_membership_evaluated_by_id_person_id_fk" FOREIGN KEY ("evaluated_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recognition_month_unique" ON "recognition" USING btree ("term_id","committee_id","month") WHERE "recognition"."kind" = 'MEMBER_OF_MONTH';--> statement-breakpoint
CREATE INDEX "recognition_person_idx" ON "recognition" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leader_score_unique" ON "leader_score" USING btree ("rule_id","person_id");--> statement-breakpoint
CREATE INDEX "leader_score_person_term_idx" ON "leader_score" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_credit_unique" ON "manual_credit" USING btree ("rule_id","person_id");--> statement-breakpoint
CREATE INDEX "manual_credit_person_term_idx" ON "manual_credit" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_decision_committee_unique" ON "permanence_decision" USING btree ("term_id","person_id","committee_id") WHERE "permanence_decision"."committee_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_decision_person_unique" ON "permanence_decision" USING btree ("term_id","person_id") WHERE "permanence_decision"."committee_id" is null;--> statement-breakpoint
CREATE INDEX "permanence_decision_term_idx" ON "permanence_decision" USING btree ("term_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_rule_general_unique" ON "permanence_rule" USING btree ("term_id","key") WHERE "permanence_rule"."scope" = 'GENERAL';--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_rule_committee_unique" ON "permanence_rule" USING btree ("term_id","committee_id","key") WHERE "permanence_rule"."scope" = 'COMMITTEE';--> statement-breakpoint
CREATE INDEX "permanence_rule_term_idx" ON "permanence_rule" USING btree ("term_id","committee_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_snapshot_unique" ON "permanence_snapshot" USING btree ("term_id","person_id");--> statement-breakpoint
CREATE INDEX "permanence_snapshot_term_idx" ON "permanence_snapshot" USING btree ("term_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_table_general_unique" ON "permanence_table" USING btree ("term_id") WHERE "permanence_table"."scope" = 'GENERAL';--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_table_committee_unique" ON "permanence_table" USING btree ("term_id","committee_id") WHERE "permanence_table"."scope" = 'COMMITTEE';--> statement-breakpoint
CREATE UNIQUE INDEX "work_group_code_unique" ON "work_group" USING btree ("term_id","code") WHERE "work_group"."code" is not null;--> statement-breakpoint
CREATE INDEX "work_group_term_kind_idx" ON "work_group" USING btree ("term_id","kind");--> statement-breakpoint
CREATE INDEX "work_group_leader_idx" ON "work_group" USING btree ("leader_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_group_evaluator_unique" ON "work_group_evaluator" USING btree ("group_id","person_id");--> statement-breakpoint
CREATE INDEX "work_group_evaluator_person_idx" ON "work_group_evaluator" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_group_membership_unique" ON "work_group_membership" USING btree ("group_id","person_id");--> statement-breakpoint
CREATE INDEX "work_group_membership_person_idx" ON "work_group_membership" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_committee_idx" ON "announcement" USING btree ("committee_id","published_at");--> statement-breakpoint
-- Configuración de la fase 4 (ADR-036): ventana de evaluación antes del fin del término y días del aviso
-- de cierre. Datos del sistema, no seed (como 0001, 0004 y 0005).
INSERT INTO "app_config" ("key", "value") VALUES
  ('permanence.evaluationWindowDays', '14'),
  ('permanence.warningDays', '21')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- El paso "decoracion" del onboarding se marca solo con una evaluación buena de la tarea de nuevos,
-- si GH no lo cambió a mano.
UPDATE "app_config"
SET "value" = (
  SELECT jsonb_agg(
    CASE WHEN step->>'key' = 'decoracion' AND step->'auto' = 'null'::jsonb
      THEN jsonb_set(step, '{auto}', '"NEW_MEMBER_TASK"'::jsonb)
      ELSE step END
  )
  FROM jsonb_array_elements("value") AS step
)
WHERE "key" = 'onboarding.steps' AND jsonb_typeof("value") = 'array';
