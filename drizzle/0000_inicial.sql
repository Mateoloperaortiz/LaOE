CREATE TYPE "public"."publication_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('LOGIN', 'STEP_UP');--> statement-breakpoint
CREATE TYPE "public"."permission_code" AS ENUM('ADMIN', 'COMMITTEE_LEADER', 'BOARD');--> statement-breakpoint
CREATE TYPE "public"."committee_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."membership_end_reason" AS ENUM('GRADUATION', 'RESIGNATION', 'PERMANENCE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'ON_LEAVE', 'HONORARY', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."person_kind" AS ENUM('STUDENT', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."person_stage" AS ENUM('PROSPECT', 'APPLICANT', 'MEMBER', 'ALUMNI');--> statement-breakpoint
CREATE TABLE "otp_challenge" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"purpose" "otp_purpose" DEFAULT 'LOGIN' NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"code" "permission_code" NOT NULL,
	"committee_id" text,
	"granted_by_id" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_committee_scope" CHECK (("permission"."code" = 'COMMITTEE_LEADER') = ("permission"."committee_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"remembered" boolean DEFAULT false NOT NULL,
	"otp_verified_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"semester" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"points_closed_at" timestamp with time zone,
	"required_ordinary_assemblies" integer DEFAULT 1 NOT NULL,
	"permanence_general_nominal" integer DEFAULT 50 NOT NULL,
	"permanence_committee_nominal" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_code_format" CHECK ("term"."code" ~ '^[0-9]{4}-[12]$'),
	CONSTRAINT "term_semester_valid" CHECK ("term"."semester" in (1, 2)),
	CONSTRAINT "term_dates_ordered" CHECK ("term"."starts_on" < "term"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "committee" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "committee_status" DEFAULT 'ACTIVE' NOT NULL,
	"color" text,
	"logo_key" text,
	"presentation" text,
	"contact_url" text,
	"publication_status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committee_slug_format" CHECK ("committee"."slug" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "committee_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"term_id" text NOT NULL,
	"role_code" text DEFAULT 'MIEMBRO' NOT NULL,
	"transferred_in" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee_role" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"is_leadership" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"first_term_id" text NOT NULL,
	"last_term_id" text,
	"ended_at" timestamp with time zone,
	"end_reason" "membership_end_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_end_consistent" CHECK (("membership"."ended_at" is null) = ("membership"."end_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "membership_event" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"from_status" "membership_status",
	"to_status" "membership_status" NOT NULL,
	"reason" text,
	"actor_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"kind" "person_kind" DEFAULT 'STUDENT' NOT NULL,
	"stage" "person_stage" DEFAULT 'PROSPECT' NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"full_name" text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
	"preferred_name" text,
	"phone" text,
	"personal_email" text,
	"program" text,
	"source" text DEFAULT 'ADMIN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_email_lowercase" CHECK ("person"."email" = lower("person"."email"))
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"legacy" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"dead_letter_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "permission" ADD CONSTRAINT "permission_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission" ADD CONSTRAINT "permission_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission" ADD CONSTRAINT "permission_granted_by_id_person_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_membership" ADD CONSTRAINT "committee_membership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_membership" ADD CONSTRAINT "committee_membership_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_membership" ADD CONSTRAINT "committee_membership_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_membership" ADD CONSTRAINT "committee_membership_role_code_committee_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."committee_role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_first_term_id_term_id_fk" FOREIGN KEY ("first_term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_last_term_id_term_id_fk" FOREIGN KEY ("last_term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_actor_id_person_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_id_person_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_person_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_challenge_email_idx" ON "otp_challenge" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenge_ip_idx" ON "otp_challenge" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_global_unique" ON "permission" USING btree ("person_id","code") WHERE "permission"."committee_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_committee_unique" ON "permission" USING btree ("person_id","code","committee_id") WHERE "permission"."committee_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_hash_unique" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_person_idx" ON "session" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "term_code_unique" ON "term" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_slug_unique" ON "committee" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_membership_person_committee_term_unique" ON "committee_membership" USING btree ("person_id","committee_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_membership_one_general" ON "committee_membership" USING btree ("committee_id","term_id") WHERE "committee_membership"."role_code" = 'GENERAL' and "committee_membership"."left_at" is null;--> statement-breakpoint
CREATE INDEX "committee_membership_term_idx" ON "committee_membership" USING btree ("term_id","committee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_person_unique" ON "membership" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "membership_status_idx" ON "membership" USING btree ("status");--> statement-breakpoint
CREATE INDEX "membership_event_membership_idx" ON "membership_event" USING btree ("membership_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_unique" ON "person" USING btree ("email");--> statement-breakpoint
CREATE INDEX "person_stage_idx" ON "person" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_key_pending_unique" ON "outbox" USING btree ("dedupe_key") WHERE "outbox"."processed_at" is null and "outbox"."dead_letter_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("next_attempt_at") WHERE "outbox"."processed_at" is null and "outbox"."dead_letter_at" is null;