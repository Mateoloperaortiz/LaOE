CREATE TABLE "board_calendar_event" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"area" text DEFAULT 'BOARD' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"origin" text DEFAULT 'CASA' NOT NULL,
	"google_event_id" text,
	"google_html_link" text,
	"created_by_id" text,
	"updated_by_id" text,
	"cancelled_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"sync_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_calendar_event_area_known" CHECK ("board_calendar_event"."area" in ('BOARD', 'PRESIDENT', 'VP_ADMIN', 'VP_FINANCE', 'VP_PUBLIC_RELATIONS', 'VP_COMMUNICATIONS', 'VP_GH')),
	CONSTRAINT "board_calendar_event_origin_known" CHECK ("board_calendar_event"."origin" in ('CASA', 'GOOGLE')),
	CONSTRAINT "board_calendar_event_ends_after_start" CHECK ("board_calendar_event"."ends_at" >= "board_calendar_event"."starts_at"),
	CONSTRAINT "board_calendar_event_google_origin_has_id" CHECK ("board_calendar_event"."origin" <> 'GOOGLE' or "board_calendar_event"."google_event_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "board_calendar_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"last_pulled_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_calendar_event" ADD CONSTRAINT "board_calendar_event_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_calendar_event" ADD CONSTRAINT "board_calendar_event_updated_by_id_person_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_calendar_event_google_unique" ON "board_calendar_event" USING btree ("google_event_id");--> statement-breakpoint
CREATE INDEX "board_calendar_event_starts_idx" ON "board_calendar_event" USING btree ("starts_at");