CREATE TABLE "appointment_election_record" (
	"appointment_id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_election_origin" CHECK ("appointment_election_record"."origin" in ('ELECTED', 'BOARD_SUBSTITUTE'))
);
--> statement-breakpoint
CREATE TABLE "macroevent_reactivation" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"year" integer NOT NULL,
	"submitted_on" date NOT NULL,
	"election_session" text NOT NULL,
	"mission" text NOT NULL,
	"work_plan" text NOT NULL,
	"roster" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"decision_minutes" text,
	"assembly_notice" text,
	"decided_at" timestamp with time zone,
	"recorded_by" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "macroevent_reactivation_status" CHECK ("macroevent_reactivation"."status" in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "macroevent_reactivation_year" CHECK ("macroevent_reactivation"."year" between 2026 and 2100)
);
--> statement-breakpoint
CREATE TABLE "macroevent_review" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"year" integer NOT NULL,
	"assembly_on" date NOT NULL,
	"minutes" text NOT NULL,
	"elected_roles" jsonb NOT NULL,
	"status" text NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "macroevent_review_status" CHECK ("macroevent_review"."status" in ('ENABLED', 'DISABLED')),
	CONSTRAINT "macroevent_review_year" CHECK ("macroevent_review"."year" between 2026 and 2100)
);
--> statement-breakpoint
ALTER TABLE "appointment_election_record" ADD CONSTRAINT "appointment_election_record_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_election_record" ADD CONSTRAINT "appointment_election_record_reviewed_by_person_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macroevent_reactivation" ADD CONSTRAINT "macroevent_reactivation_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macroevent_reactivation" ADD CONSTRAINT "macroevent_reactivation_recorded_by_person_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macroevent_reactivation" ADD CONSTRAINT "macroevent_reactivation_decided_by_person_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macroevent_review" ADD CONSTRAINT "macroevent_review_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macroevent_review" ADD CONSTRAINT "macroevent_review_reviewed_by_person_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "macroevent_reactivation_event_year_idx" ON "macroevent_reactivation" USING btree ("event_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "macroevent_review_year_unique" ON "macroevent_review" USING btree ("event_id","year");
--> statement-breakpoint
-- La clave histórica permanece intacta durante el relevo y para los términos anteriores.
INSERT INTO "app_config" ("key", "value") VALUES
  ('permanence.probationMargins2026', '{"active":10,"new":0,"probation":0,"transfer":0}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
