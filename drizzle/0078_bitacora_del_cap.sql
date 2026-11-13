CREATE TYPE "public"."follow_up_kind" AS ENUM('CAP_PLAN', 'CAP_MEETING', 'EDITION_PLAN', 'EDITION_MEETING', 'EDITION_HANDOVER');--> statement-breakpoint
CREATE TABLE "cap_companion" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"person_id" text NOT NULL,
	"assigned_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "follow_up_kind" NOT NULL,
	"term_id" text NOT NULL,
	"committee_id" text,
	"edition_id" text,
	"role_code" text,
	"month" text,
	"occurred_on" date NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_entry_subject" CHECK (("follow_up_entry"."kind"::text like 'CAP_%') = ("follow_up_entry"."committee_id" is not null and "follow_up_entry"."edition_id" is null)),
	CONSTRAINT "follow_up_entry_month" CHECK (("follow_up_entry"."kind"::text in ('CAP_PLAN', 'EDITION_PLAN')) = ("follow_up_entry"."month" is not null)),
	CONSTRAINT "follow_up_entry_month_format" CHECK ("follow_up_entry"."month" is null or "follow_up_entry"."month" ~ '^[0-9]{4}-[0-9]{2}$'),
	CONSTRAINT "follow_up_entry_handover_role" CHECK (("follow_up_entry"."kind"::text = 'EDITION_HANDOVER') = ("follow_up_entry"."role_code" is not null)),
	CONSTRAINT "follow_up_entry_answers_array" CHECK (jsonb_typeof("follow_up_entry"."answers") = 'array')
);
--> statement-breakpoint
CREATE TABLE "follow_up_template" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "follow_up_kind" NOT NULL,
	"role_code" text,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_up_template_questions_array" CHECK (jsonb_typeof("follow_up_template"."questions") = 'array')
);
--> statement-breakpoint
ALTER TABLE "cap_companion" ADD CONSTRAINT "cap_companion_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_companion" ADD CONSTRAINT "cap_companion_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_companion" ADD CONSTRAINT "cap_companion_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_companion" ADD CONSTRAINT "cap_companion_assigned_by_id_person_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_entry" ADD CONSTRAINT "follow_up_entry_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_entry" ADD CONSTRAINT "follow_up_entry_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_entry" ADD CONSTRAINT "follow_up_entry_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_entry" ADD CONSTRAINT "follow_up_entry_author_id_person_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_template" ADD CONSTRAINT "follow_up_template_updated_by_id_person_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cap_companion_committee_unique" ON "cap_companion" USING btree ("term_id","committee_id");--> statement-breakpoint
CREATE INDEX "cap_companion_person_idx" ON "cap_companion" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE INDEX "follow_up_entry_committee_idx" ON "follow_up_entry" USING btree ("committee_id","occurred_on");--> statement-breakpoint
CREATE INDEX "follow_up_entry_edition_idx" ON "follow_up_entry" USING btree ("edition_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_entry_cap_plan_unique" ON "follow_up_entry" USING btree ("committee_id","month") WHERE "follow_up_entry"."kind" = 'CAP_PLAN';--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_entry_edition_plan_unique" ON "follow_up_entry" USING btree ("edition_id","month") WHERE "follow_up_entry"."kind" = 'EDITION_PLAN';--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_entry_handover_unique" ON "follow_up_entry" USING btree ("edition_id","role_code") WHERE "follow_up_entry"."kind" = 'EDITION_HANDOVER';--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_template_kind_unique" ON "follow_up_template" USING btree ("kind") WHERE "follow_up_template"."role_code" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_template_kind_role_unique" ON "follow_up_template" USING btree ("kind","role_code") WHERE "follow_up_template"."role_code" is not null;