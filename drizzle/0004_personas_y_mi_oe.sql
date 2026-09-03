CREATE TYPE "public"."document_kind" AS ENUM('ESTATUTOS', 'REGLAMENTO', 'ACTA', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('OPEN', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."appointment_kind" AS ENUM('PRESIDENT', 'VP_GH', 'VP_PUBLIC_RELATIONS', 'VP_ADMIN', 'VP_FINANCE', 'GH_HEAD', 'GH_DIRECTOR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('MEMBERSHIP', 'COMMUNICATIONS', 'DIRECTORY_PHOTO', 'MEMORIAL');--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('FORM', 'IMPORT', 'ADMIN', 'SELF');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('PREVIEW', 'APPLIED', 'DISCARDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" "document_kind" DEFAULT 'OTRO' NOT NULL,
	"file_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text,
	"version" text NOT NULL,
	"audience" "audience" DEFAULT 'MEMBERS' NOT NULL,
	"status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_article" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"article_key" text NOT NULL,
	"chapter_key" text NOT NULL,
	"chapter_title" text NOT NULL,
	"number" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(title, '') || ' ' || body)) STORED
);
--> statement-breakpoint
CREATE TABLE "interaction" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"ref_type" text,
	"ref_id" text,
	"summary" text NOT NULL,
	"body" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"step_key" text NOT NULL,
	"done_at" timestamp with time zone,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'GENERAL' NOT NULL,
	"assignee_id" text,
	"due_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'OPEN' NOT NULL,
	"person_id" text,
	"created_by_id" text,
	"completed_at" timestamp with time zone,
	"completed_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"kind" "appointment_kind" NOT NULL,
	"committee_id" text,
	"term_id" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"source" "consent_source" NOT NULL,
	"policy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "membership_term" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"probation" boolean DEFAULT false NOT NULL,
	"reason" text,
	"decided_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_job" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" "import_job_status" DEFAULT 'PREVIEW' NOT NULL,
	"filename" text NOT NULL,
	"file_key" text,
	"term_id" text,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "committee" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "photo_asset_id" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "sessions_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_id_person_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_article" ADD CONSTRAINT "document_article_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_actor_id_person_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_tag" ADD CONSTRAINT "person_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_person_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_completed_by_id_person_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_term" ADD CONSTRAINT "membership_term_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_term" ADD CONSTRAINT "membership_term_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_term" ADD CONSTRAINT "membership_term_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_file_key_unique" ON "document" USING btree ("file_key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_article_key_unique" ON "document_article" USING btree ("document_id","article_key");--> statement-breakpoint
CREATE INDEX "document_article_search_idx" ON "document_article" USING gin ("search");--> statement-breakpoint
CREATE INDEX "interaction_person_idx" ON "interaction" USING btree ("person_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interaction_ref_unique" ON "interaction" USING btree ("ref_type","ref_id") WHERE "interaction"."ref_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_progress_unique" ON "onboarding_progress" USING btree ("person_id","term_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "person_tag_unique" ON "person_tag" USING btree ("person_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_name_unique" ON "tag" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "task_assignee_idx" ON "task" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "task_person_idx" ON "task" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "task_status_due_idx" ON "task" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "appointment_person_idx" ON "appointment" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_live_unique" ON "consent" USING btree ("person_id","purpose") WHERE "consent"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "consent_person_idx" ON "consent" USING btree ("person_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_term_person_term_unique" ON "membership_term" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE INDEX "import_job_created_idx" ON "import_job" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_legacy_id_unique" ON "committee" USING btree ("legacy_id") WHERE "committee"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "person_legacy_id_unique" ON "person" USING btree ("legacy_id") WHERE "person"."legacy_id" is not null;--> statement-breakpoint
-- Configuración de la fase 2 (ADR-034): pasos del onboarding (etiquetas de T-067, GH los define) y plazo de la eliminación.
-- Son datos del sistema, no seed: viven en la migración para que db:release los garantice (como 0001).
INSERT INTO "app_config" ("key", "value") VALUES
  ('onboarding.steps', '[{"key":"normativa","label":"Leé los estatutos y el reglamento","auto":"NORMATIVA_READ"},{"key":"comite","label":"Conocé a tu comité","auto":null},{"key":"integracion","label":"Andá a tu primera integración","auto":"FIRST_INTEGRATION"},{"key":"push","label":"Activá las notificaciones","auto":"PUSH_ENABLED"},{"key":"decoracion","label":"Decorá la oficina con los nuevos","auto":null}]'),
  ('privacy.deletionDays', '15')
ON CONFLICT ("key") DO NOTHING;
