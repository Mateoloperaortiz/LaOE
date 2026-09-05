CREATE TYPE "public"."call_entry_status" AS ENUM('APPLIED', 'ACCEPTED', 'WAITLISTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."call_selection" AS ENUM('FIRST_COME', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."organization_kind" AS ENUM('COMPANY', 'EAFIT_UNIT', 'STUDENT_GROUP', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."pipeline_kind" AS ENUM('ADMISSION', 'SPONSORSHIP', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('LEAVE', 'RESIGNATION', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('REGISTERED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."consent_purpose" ADD VALUE 'DATA_PROCESSING';--> statement-breakpoint
CREATE TABLE "card" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"person_id" text,
	"organization_id" text,
	"edition_id" text,
	"submission_id" text,
	"owner_id" text,
	"title" text NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"amount" numeric(12, 2),
	"due_at" timestamp with time zone,
	"entered_stage_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_one_subject" CHECK (("card"."person_id" is null) <> ("card"."organization_id" is null))
);
--> statement-breakpoint
CREATE TABLE "internal_call" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"group_id" text NOT NULL,
	"form_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"capacity" integer,
	"selection" "call_selection" DEFAULT 'FIRST_COME' NOT NULL,
	"status" "call_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_call_window" CHECK ("internal_call"."closes_at" > "internal_call"."opens_at"),
	CONSTRAINT "internal_call_capacity_positive" CHECK ("internal_call"."capacity" is null or "internal_call"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "internal_call_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"person_id" text NOT NULL,
	"submission_id" text,
	"status" "call_entry_status" DEFAULT 'APPLIED' NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "organization_kind" DEFAULT 'OTHER' NOT NULL,
	"website" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "pipeline_kind" DEFAULT 'CUSTOM' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_stage_won_xor_lost" CHECK (not ("pipeline_stage"."is_won" and "pipeline_stage"."is_lost"))
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"kind" "request_kind" NOT NULL,
	"term_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "request_status" DEFAULT 'PENDING' NOT NULL,
	"task_id" text,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_reason_when_rejected" CHECK ("request"."status" <> 'REJECTED' or "request"."reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "edition_registration" (
	"id" text PRIMARY KEY NOT NULL,
	"edition_id" text NOT NULL,
	"person_id" text NOT NULL,
	"submission_id" text,
	"status" "registration_status" DEFAULT 'REGISTERED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audience" "audience" DEFAULT 'PUBLIC' NOT NULL,
	"status" "form_status" DEFAULT 'DRAFT' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"max_submissions" integer,
	"allow_multiple" boolean DEFAULT false NOT NULL,
	"consent_required" boolean DEFAULT true NOT NULL,
	"thanks" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_slug_format" CHECK ("form"."slug" ~ '^[a-z0-9-]{2,60}$'),
	CONSTRAINT "form_window_ordered" CHECK ("form"."closes_at" is null or "form"."opens_at" is null or "form"."closes_at" > "form"."opens_at"),
	CONSTRAINT "form_max_submissions_positive" CHECK ("form"."max_submissions" is null or "form"."max_submissions" > 0)
);
--> statement-breakpoint
CREATE TABLE "form_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"person_id" text,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_accepted_at" timestamp with time zone,
	"policy_version" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_submission_email_lowercase" CHECK ("form_submission"."email" = lower("form_submission"."email"))
);
--> statement-breakpoint
ALTER TABLE "interaction" ALTER COLUMN "person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interaction" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "card_id" text;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_submission_id_form_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_owner_id_person_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call" ADD CONSTRAINT "internal_call_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call" ADD CONSTRAINT "internal_call_group_id_work_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."work_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call" ADD CONSTRAINT "internal_call_form_id_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call" ADD CONSTRAINT "internal_call_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call_entry" ADD CONSTRAINT "internal_call_entry_call_id_internal_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."internal_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call_entry" ADD CONSTRAINT "internal_call_entry_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call_entry" ADD CONSTRAINT "internal_call_entry_submission_id_form_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_call_entry" ADD CONSTRAINT "internal_call_entry_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contact" ADD CONSTRAINT "organization_contact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contact" ADD CONSTRAINT "organization_contact_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tag" ADD CONSTRAINT "organization_tag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tag" ADD CONSTRAINT "organization_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_registration" ADD CONSTRAINT "edition_registration_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_registration" ADD CONSTRAINT "edition_registration_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_registration" ADD CONSTRAINT "edition_registration_submission_id_form_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form" ADD CONSTRAINT "form_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_form_id_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_stage_idx" ON "card" USING btree ("pipeline_id","stage_id");--> statement-breakpoint
CREATE INDEX "card_person_idx" ON "card" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "card_organization_idx" ON "card" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_submission_unique" ON "card" USING btree ("submission_id") WHERE "card"."submission_id" is not null;--> statement-breakpoint
CREATE INDEX "internal_call_group_idx" ON "internal_call" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "internal_call_term_status_idx" ON "internal_call" USING btree ("term_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_call_entry_unique" ON "internal_call_entry" USING btree ("call_id","person_id");--> statement-breakpoint
CREATE INDEX "internal_call_entry_person_idx" ON "internal_call_entry" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_name_unique" ON "organization" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "organization_contact_unique" ON "organization_contact" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_contact_primary_unique" ON "organization_contact" USING btree ("organization_id") WHERE "organization_contact"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "organization_contact_person_idx" ON "organization_contact" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_tag_unique" ON "organization_tag" USING btree ("organization_id","tag_id");--> statement-breakpoint
CREATE INDEX "pipeline_stage_pipeline_idx" ON "pipeline_stage" USING btree ("pipeline_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "request_pending_unique" ON "request" USING btree ("person_id","kind") WHERE "request"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "request_status_idx" ON "request" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "request_person_idx" ON "request" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edition_registration_unique" ON "edition_registration" USING btree ("edition_id","person_id");--> statement-breakpoint
CREATE INDEX "edition_registration_person_idx" ON "edition_registration" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_slug_unique" ON "form" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "form_submission_form_created_idx" ON "form_submission" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "form_submission_person_idx" ON "form_submission" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "form_submission_ip_idx" ON "form_submission" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "form_submission_email_idx" ON "form_submission" USING btree ("form_id","email");--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interaction_organization_idx" ON "interaction" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "task_organization_idx" ON "task" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_has_subject" CHECK ("interaction"."person_id" is not null or "interaction"."organization_id" is not null);--> statement-breakpoint
-- Búsqueda de organizaciones en la paleta ⌘K (ADR-037), como personas, comités y ocasiones.
CREATE INDEX IF NOT EXISTS "organization_name_trgm_idx" ON "organization" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
-- Configuración de la fase 5 (ADR-037): días hábiles para responder una solicitud. Datos del sistema, no seed (como 0001, 0004, 0005 y 0006).
INSERT INTO "app_config" ("key", "value") VALUES ('requests.taskDays', '5') ON CONFLICT ("key") DO NOTHING;
