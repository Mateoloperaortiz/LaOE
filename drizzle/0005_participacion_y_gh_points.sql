CREATE TYPE "public"."assembly_kind" AS ENUM('ORDINARY', 'BOARD_ELECTION', 'RUNOFF');--> statement-breakpoint
CREATE TYPE "public"."check_in_source" AS ENUM('SELF_QR', 'HOST', 'ADMIN', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."check_in_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."occasion_approval" AS ENUM('AUTO', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."occasion_category" AS ENUM('INTEGRATION', 'ATHLETIC_MATCH', 'COMMITTEE_MEETING', 'TALK', 'WORKSHOP', 'SOCIAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."occasion_kind" AS ENUM('ACTIVITY', 'ASSEMBLY', 'EDITION_SESSION');--> statement-breakpoint
CREATE TYPE "public"."occasion_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."point_entry_kind" AS ENUM('CHECKIN', 'ADJUSTMENT', 'REVERSAL', 'LEGACY');--> statement-breakpoint
CREATE TABLE "assembly_requirement" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"person_id" text NOT NULL,
	"required_ordinary" integer NOT NULL,
	"requires_board_election" boolean NOT NULL,
	"requires_runoff" boolean NOT NULL,
	"adjusted_reason" text NOT NULL,
	"adjusted_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"person_id" text NOT NULL,
	"status" "check_in_status" DEFAULT 'PENDING' NOT NULL,
	"source" "check_in_source" DEFAULT 'SELF_QR' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"reason" text,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee_participation" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"term_id" text NOT NULL,
	"eligible" integer NOT NULL,
	"present" integer NOT NULL,
	"rate" numeric(6, 4) NOT NULL,
	"smoothed_rate" numeric(6, 4) NOT NULL,
	"frozen_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occasion" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"term_id" text NOT NULL,
	"kind" "occasion_kind" DEFAULT 'ACTIVITY' NOT NULL,
	"assembly_kind" "assembly_kind",
	"category" "occasion_category" DEFAULT 'OTHER' NOT NULL,
	"new_members_only" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"check_in_opens_at" timestamp with time zone NOT NULL,
	"check_in_closes_at" timestamp with time zone NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"approval" "occasion_approval" DEFAULT 'AUTO' NOT NULL,
	"require_rotating_code" boolean DEFAULT false NOT NULL,
	"rotating_secret" text,
	"committee_id" text,
	"edition_id" text,
	"status" "occasion_status" DEFAULT 'DRAFT' NOT NULL,
	"cancel_reason" text,
	"closed_at" timestamp with time zone,
	"created_by_id" text,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occasion_public_id_format" CHECK ("occasion"."public_id" ~ '^[0-9a-z]{10}$'),
	CONSTRAINT "occasion_window_ordered" CHECK ("occasion"."check_in_opens_at" < "occasion"."check_in_closes_at"),
	CONSTRAINT "occasion_points_nonnegative" CHECK ("occasion"."points" >= 0),
	CONSTRAINT "occasion_assembly_kind_consistent" CHECK (("occasion"."kind" = 'ASSEMBLY') = ("occasion"."assembly_kind" is not null)),
	CONSTRAINT "occasion_assembly_no_points" CHECK ("occasion"."kind" <> 'ASSEMBLY' or "occasion"."points" = 0),
	CONSTRAINT "occasion_edition_session_has_edition" CHECK ("occasion"."kind" <> 'EDITION_SESSION' or "occasion"."edition_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "point_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"check_in_id" text,
	"kind" "point_entry_kind" NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"reversal_of_id" text,
	"created_by_id" text,
	"legacy_type" text,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_entry_nonzero" CHECK ("point_entry"."points" <> 0),
	CONSTRAINT "point_entry_reversal_consistent" CHECK (("point_entry"."kind" = 'REVERSAL') = ("point_entry"."reversal_of_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "term_standing" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"top_new" jsonb NOT NULL,
	"top_veteran" jsonb NOT NULL,
	"top_committees" jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"target_type" text DEFAULT 'OCCASION' NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assembly_requirement" ADD CONSTRAINT "assembly_requirement_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_requirement" ADD CONSTRAINT "assembly_requirement_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_requirement" ADD CONSTRAINT "assembly_requirement_adjusted_by_id_person_id_fk" FOREIGN KEY ("adjusted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_participation" ADD CONSTRAINT "committee_participation_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_participation" ADD CONSTRAINT "committee_participation_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_participation" ADD CONSTRAINT "committee_participation_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion" ADD CONSTRAINT "occasion_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion" ADD CONSTRAINT "occasion_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion" ADD CONSTRAINT "occasion_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion" ADD CONSTRAINT "occasion_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_check_in_id_check_in_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_in"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_reversal_of_id_point_entry_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."point_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_standing" ADD CONSTRAINT "term_standing_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assembly_requirement_unique" ON "assembly_requirement" USING btree ("term_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_occasion_person_unique" ON "check_in" USING btree ("occasion_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_legacy_id_unique" ON "check_in" USING btree ("legacy_id") WHERE "check_in"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "check_in_person_idx" ON "check_in" USING btree ("person_id","at");--> statement-breakpoint
CREATE INDEX "check_in_occasion_status_idx" ON "check_in" USING btree ("occasion_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_participation_unique" ON "committee_participation" USING btree ("occasion_id","committee_id");--> statement-breakpoint
CREATE INDEX "committee_participation_term_idx" ON "committee_participation" USING btree ("term_id","committee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occasion_public_id_unique" ON "occasion" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occasion_legacy_id_unique" ON "occasion" USING btree ("legacy_id") WHERE "occasion"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "occasion_board_election_unique" ON "occasion" USING btree ("term_id") WHERE "occasion"."assembly_kind" = 'BOARD_ELECTION' and "occasion"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE UNIQUE INDEX "occasion_runoff_unique" ON "occasion" USING btree ("term_id") WHERE "occasion"."assembly_kind" = 'RUNOFF' and "occasion"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "occasion_term_status_idx" ON "occasion" USING btree ("term_id","status");--> statement-breakpoint
CREATE INDEX "occasion_window_idx" ON "occasion" USING btree ("status","check_in_opens_at","check_in_closes_at");--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_checkin_unique" ON "point_entry" USING btree ("check_in_id") WHERE "point_entry"."kind" = 'CHECKIN';--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_reversal_of_unique" ON "point_entry" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_legacy_id_unique" ON "point_entry" USING btree ("legacy_id") WHERE "point_entry"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "point_entry_person_term_idx" ON "point_entry" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE INDEX "point_entry_term_created_idx" ON "point_entry" USING btree ("term_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "term_standing_term_unique" ON "term_standing" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_alias_path_unique" ON "legacy_alias" USING btree ("path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "occasion_title_trgm_idx" ON "occasion" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
-- Configuración de la fase 3 (ADR-035): cortes de los niveles de GH Points (etiquetas de T-082; GH puede
-- cambiarlos), ventana de check-in por defecto alrededor del inicio y horas para el cierre automático.
-- Son datos del sistema, no seed: viven en la migración para que db:release los garantice (como 0001 y 0004).
INSERT INTO "app_config" ("key", "value") VALUES
  ('points.levels', '[0, 100, 250, 500, 1000]'),
  ('checkin.defaultWindow', '{"opensMinutesBefore": 30, "closesMinutesAfter": 180}'),
  ('occasions.autoCloseHours', '24')
ON CONFLICT ("key") DO NOTHING;
