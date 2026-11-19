CREATE TABLE "inventory_space" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"scope_label" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"purpose" text NOT NULL,
	"status" "board_approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_as" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "space_booking_interval" CHECK ("space_booking"."starts_at" < "space_booking"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "schedule_conflict" (
	"id" text PRIMARY KEY NOT NULL,
	"pair_key" text NOT NULL,
	"scope_keys" jsonb NOT NULL,
	"first_ref" text NOT NULL,
	"second_ref" text NOT NULL,
	"first_title" text NOT NULL,
	"second_title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"seat" text NOT NULL,
	"requester_id" text NOT NULL,
	"attempts" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolution" text,
	"resolved_by_id" text,
	"resolved_as" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "schedule_conflict_pairKey_unique" UNIQUE("pair_key")
);
--> statement-breakpoint
ALTER TABLE "space_booking" ADD CONSTRAINT "space_booking_space_id_inventory_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."inventory_space"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_booking" ADD CONSTRAINT "space_booking_requester_id_person_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_booking" ADD CONSTRAINT "space_booking_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_conflict" ADD CONSTRAINT "schedule_conflict_requester_id_person_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_conflict" ADD CONSTRAINT "schedule_conflict_resolved_by_id_person_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_space_name_unique" ON "inventory_space" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "space_booking_calendar_idx" ON "space_booking" USING btree ("space_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "schedule_conflict_inbox_idx" ON "schedule_conflict" USING btree ("seat","resolved_at");