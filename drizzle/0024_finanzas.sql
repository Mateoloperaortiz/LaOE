CREATE TYPE "public"."budget_kind" AS ENUM('ORDINARY', 'EXTRAORDINARY');--> statement-breakpoint
CREATE TYPE "public"."budget_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."event_approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "budget_expense" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"line_id" text NOT NULL,
	"approval_id" text,
	"spent_on" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"registered_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_expense_amount_positive" CHECK ("budget_expense"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "budget_line" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"name" text NOT NULL,
	"assigned" numeric(12, 2) DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_line_assigned_positive" CHECK ("budget_line"."assigned" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_prerequest" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"month" text NOT NULL,
	"submitted_on" date NOT NULL,
	"submitted_by_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_prerequest_month_format" CHECK ("budget_prerequest"."month" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "budget_transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"from_line_id" text NOT NULL,
	"to_line_id" text NOT NULL,
	"approval_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"registered_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_transfer_amount_positive" CHECK ("budget_transfer"."amount" > 0),
	CONSTRAINT "budget_transfer_distinct_lines" CHECK ("budget_transfer"."from_line_id" <> "budget_transfer"."to_line_id")
);
--> statement-breakpoint
CREATE TABLE "committee_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"committee_id" text NOT NULL,
	"year" integer NOT NULL,
	"kind" "budget_kind" DEFAULT 'ORDINARY' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" "budget_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"submitted_on" date,
	"student_development_approved_on" date,
	"vp_finance_approved_on" date,
	"sanction_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"sanction_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committee_budget_year_range" CHECK ("committee_budget"."year" between 2000 and 2100),
	CONSTRAINT "committee_budget_open_approved" CHECK ("committee_budget"."status"::text <> 'OPEN' or ("committee_budget"."student_development_approved_on" is not null and "committee_budget"."vp_finance_approved_on" is not null)),
	CONSTRAINT "committee_budget_sanction_range" CHECK ("committee_budget"."sanction_percent" between 0 and 100),
	CONSTRAINT "committee_budget_extraordinary_title" CHECK ("committee_budget"."kind"::text <> 'EXTRAORDINARY' or "committee_budget"."title" <> '')
);
--> statement-breakpoint
CREATE TABLE "event_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"committee_id" text NOT NULL,
	"budget_id" text,
	"edition_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"event_on" date NOT NULL,
	"status" "event_approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "event_approval_decided_consistent" CHECK (("event_approval"."status"::text = 'PENDING') = ("event_approval"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "budget_expense" ADD CONSTRAINT "budget_expense_budget_id_committee_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."committee_budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense" ADD CONSTRAINT "budget_expense_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense" ADD CONSTRAINT "budget_expense_approval_id_event_approval_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."event_approval"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expense" ADD CONSTRAINT "budget_expense_registered_by_id_person_id_fk" FOREIGN KEY ("registered_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_budget_id_committee_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."committee_budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_prerequest" ADD CONSTRAINT "budget_prerequest_budget_id_committee_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."committee_budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_prerequest" ADD CONSTRAINT "budget_prerequest_submitted_by_id_person_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transfer" ADD CONSTRAINT "budget_transfer_budget_id_committee_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."committee_budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transfer" ADD CONSTRAINT "budget_transfer_from_line_id_budget_line_id_fk" FOREIGN KEY ("from_line_id") REFERENCES "public"."budget_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transfer" ADD CONSTRAINT "budget_transfer_to_line_id_budget_line_id_fk" FOREIGN KEY ("to_line_id") REFERENCES "public"."budget_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transfer" ADD CONSTRAINT "budget_transfer_approval_id_event_approval_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."event_approval"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transfer" ADD CONSTRAINT "budget_transfer_registered_by_id_person_id_fk" FOREIGN KEY ("registered_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_budget" ADD CONSTRAINT "committee_budget_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_approval" ADD CONSTRAINT "event_approval_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_approval" ADD CONSTRAINT "event_approval_budget_id_committee_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."committee_budget"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_approval" ADD CONSTRAINT "event_approval_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_approval" ADD CONSTRAINT "event_approval_requested_by_id_person_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_approval" ADD CONSTRAINT "event_approval_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_expense_budget_idx" ON "budget_expense" USING btree ("budget_id","spent_on");--> statement-breakpoint
CREATE INDEX "budget_line_budget_idx" ON "budget_line" USING btree ("budget_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_prerequest_month_unique" ON "budget_prerequest" USING btree ("budget_id","month");--> statement-breakpoint
CREATE INDEX "budget_transfer_budget_idx" ON "budget_transfer" USING btree ("budget_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_budget_ordinary_unique" ON "committee_budget" USING btree ("committee_id","year") WHERE "committee_budget"."kind" = 'ORDINARY';--> statement-breakpoint
CREATE INDEX "committee_budget_committee_idx" ON "committee_budget" USING btree ("committee_id","year");--> statement-breakpoint
CREATE INDEX "event_approval_committee_idx" ON "event_approval" USING btree ("committee_id","status");