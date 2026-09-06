CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('TRANSACTIONAL', 'ANNOUNCEMENT', 'POINTS', 'REMINDER', 'SURVEY', 'CAMPAIGN');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."skip_reason" AS ENUM('NO_EMAIL', 'OPTED_OUT', 'NO_CONSENT', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"total_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_scheduled_has_date" CHECK ("campaign"."status" not in ('SCHEDULED', 'SENDING', 'SENT') or "campaign"."scheduled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "campaign_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"person_id" text NOT NULL,
	"status" "recipient_status" DEFAULT 'PENDING' NOT NULL,
	"skip_reason" "skip_reason",
	"message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_recipient_skip_reason" CHECK (("campaign_recipient"."status" = 'SKIPPED') = ("campaign_recipient"."skip_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "email_template" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_template_slug_format" CHECK ("email_template"."slug" ~ '^[a-z0-9-]{2,60}$')
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"email_campaigns" boolean DEFAULT true NOT NULL,
	"push_announcements" boolean DEFAULT true NOT NULL,
	"push_points" boolean DEFAULT true NOT NULL,
	"push_reminders" boolean DEFAULT true NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_token" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "occasion_survey_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"person_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"sent_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "occasion_survey_response" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"committee_id" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "kind" "message_kind" DEFAULT 'TRANSACTIONAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "push_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "push_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "occasion" ADD COLUMN "survey_form_id" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_template_id_email_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_segment_id_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_token" ADD CONSTRAINT "calendar_token_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion_survey_invite" ADD CONSTRAINT "occasion_survey_invite_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion_survey_invite" ADD CONSTRAINT "occasion_survey_invite_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion_survey_response" ADD CONSTRAINT "occasion_survey_response_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion_survey_response" ADD CONSTRAINT "occasion_survey_response_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_status_idx" ON "campaign" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipient_unique" ON "campaign_recipient" USING btree ("campaign_id","person_id");--> statement-breakpoint
CREATE INDEX "campaign_recipient_status_idx" ON "campaign_recipient" USING btree ("campaign_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_template_slug_unique" ON "email_template" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_person_unique" ON "notification_preference" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_token_unique" ON "notification_preference" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_unique" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_person_idx" ON "push_subscription" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_token_person_unique" ON "calendar_token" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_token_token_unique" ON "calendar_token" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "occasion_survey_invite_unique" ON "occasion_survey_invite" USING btree ("occasion_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "occasion_survey_invite_token_unique" ON "occasion_survey_invite" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "occasion_survey_response_occasion_idx" ON "occasion_survey_response" USING btree ("occasion_id");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion" ADD CONSTRAINT "occasion_survey_form_id_form_id_fk" FOREIGN KEY ("survey_form_id") REFERENCES "public"."form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_kind_idx" ON "message" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "message_campaign_idx" ON "message" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_person_dedupe_unique" ON "message" USING btree ("person_id","dedupe_key") WHERE "message"."dedupe_key" is not null;--> statement-breakpoint
-- Configuración de la fase 6 (ADR-038): lotes de campañas por minuto, horas de los recordatorios en
-- Bogotá y ventana de la encuesta tras la ocasión. Datos del sistema, no seed (como 0001, 0004, 0005,
-- 0006 y 0007). `survey.defaultFormId` no se siembra: sin fila vale null (GH la fija desde el admin).
INSERT INTO "app_config" ("key", "value") VALUES
  ('campaigns.perMinute', '50'),
  ('reminders.hours', '{"today":7,"eve":18}'),
  ('survey.windowDays', '7')
ON CONFLICT ("key") DO NOTHING;
