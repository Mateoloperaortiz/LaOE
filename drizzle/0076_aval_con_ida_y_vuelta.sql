CREATE TYPE "public"."event_approval_entry_kind" AS ENUM('SUBMITTED', 'RETURNED', 'RISK_CHANGED');--> statement-breakpoint
CREATE TYPE "public"."event_risk_level" AS ENUM('GREEN', 'YELLOW', 'RED');--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'PROTOCOLO_CRISIS';--> statement-breakpoint
ALTER TYPE "public"."event_approval_status" ADD VALUE 'RETURNED';--> statement-breakpoint
CREATE TABLE "event_approval_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"version" integer NOT NULL,
	"kind" "event_approval_entry_kind" NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"event_on" date,
	"risk_level" "event_risk_level",
	"risk_justification" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_approval_entry_submitted_snapshot" CHECK ("event_approval_entry"."kind"::text <> 'SUBMITTED' or "event_approval_entry"."event_on" is not null),
	CONSTRAINT "event_approval_entry_risk_changed_level" CHECK ("event_approval_entry"."kind"::text <> 'RISK_CHANGED' or "event_approval_entry"."risk_level" is not null)
);
--> statement-breakpoint
ALTER TABLE "event_approval" DROP CONSTRAINT "event_approval_decided_consistent";--> statement-breakpoint
ALTER TABLE "event_approval" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_approval" ADD COLUMN "risk_level" "event_risk_level";--> statement-breakpoint
ALTER TABLE "event_approval" ADD COLUMN "risk_justification" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_approval_entry" ADD CONSTRAINT "event_approval_entry_approval_id_event_approval_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."event_approval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_approval_entry" ADD CONSTRAINT "event_approval_entry_author_id_person_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_approval_entry_approval_idx" ON "event_approval_entry" USING btree ("approval_id","created_at");--> statement-breakpoint
ALTER TABLE "event_approval" ADD CONSTRAINT "event_approval_version_positive" CHECK ("event_approval"."version" >= 1);--> statement-breakpoint
ALTER TABLE "event_approval" ADD CONSTRAINT "event_approval_decided_consistent" CHECK (("event_approval"."status"::text in ('APPROVED', 'REJECTED')) = ("event_approval"."decided_at" is not null));--> statement-breakpoint
-- La historia de los avales que ya existían arranca con su versión 1, tal como se pidieron (ADR-197).
INSERT INTO "event_approval_entry" ("id", "approval_id", "version", "kind", "title", "description", "event_on", "author_id", "created_at")
  SELECT gen_random_uuid()::text, "id", 1, 'SUBMITTED', "title", "description", "event_on", "requested_by_id", "requested_at" FROM "event_approval";
