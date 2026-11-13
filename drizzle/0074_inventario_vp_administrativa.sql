CREATE TYPE "public"."inventory_incident_status" AS ENUM('OPEN', 'RESOLVED', 'REFERRED');--> statement-breakpoint
CREATE TYPE "public"."inventory_mode" AS ENUM('UNIT', 'QUANTITY');--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_status" AS ENUM('CONFIRMED', 'OUT', 'RETURNED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."inventory_unit_state" AS ENUM('AVAILABLE', 'QUARANTINED', 'LOST');--> statement-breakpoint
CREATE TABLE "inventory_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"term_id" text NOT NULL,
	"granted_by_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_incident" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"person_id" text NOT NULL,
	"note" text NOT NULL,
	"management" text DEFAULT '' NOT NULL,
	"status" "inventory_incident_status" DEFAULT 'OPEN' NOT NULL,
	"created_by_id" text NOT NULL,
	"referred_at" timestamp with time zone,
	"referred_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_item" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"barcode" text NOT NULL,
	"mode" "inventory_mode" NOT NULL,
	"total" integer NOT NULL,
	"quarantined" integer DEFAULT 0 NOT NULL,
	"location" text NOT NULL,
	"box" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_item_stock_valid" CHECK ("inventory_item"."total" >= 0 and "inventory_item"."quarantined" >= 0 and "inventory_item"."quarantined" <= "inventory_item"."total")
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" text NOT NULL,
	"requester_name" text NOT NULL,
	"term_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"committee_id" text,
	"edition_id" text,
	"scope_label" text NOT NULL,
	"collector_id" text NOT NULL,
	"collector_name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "inventory_reservation_status" DEFAULT 'CONFIRMED' NOT NULL,
	"checked_out_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservation_interval_valid" CHECK ("inventory_reservation"."starts_at" < "inventory_reservation"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "inventory_reservation_line" (
	"id" text PRIMARY KEY NOT NULL,
	"reservation_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"returned" integer DEFAULT 0 NOT NULL,
	"lost" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_reservation_line_quantity_valid" CHECK ("inventory_reservation_line"."quantity" > 0 and "inventory_reservation_line"."returned" >= 0 and "inventory_reservation_line"."lost" >= 0 and "inventory_reservation_line"."returned" + "inventory_reservation_line"."lost" <= "inventory_reservation_line"."quantity")
);
--> statement-breakpoint
CREATE TABLE "inventory_reservation_unit" (
	"id" text PRIMARY KEY NOT NULL,
	"line_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"returned_at" timestamp with time zone,
	"lost_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_unit" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"barcode" text NOT NULL,
	"state" "inventory_unit_state" DEFAULT 'AVAILABLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "card_uid" text;--> statement-breakpoint
ALTER TABLE "inventory_grant" ADD CONSTRAINT "inventory_grant_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_grant" ADD CONSTRAINT "inventory_grant_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_grant" ADD CONSTRAINT "inventory_grant_granted_by_id_person_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_incident" ADD CONSTRAINT "inventory_incident_reservation_id_inventory_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_incident" ADD CONSTRAINT "inventory_incident_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_incident" ADD CONSTRAINT "inventory_incident_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_incident" ADD CONSTRAINT "inventory_incident_referred_by_id_person_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_reservation_id_inventory_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_actor_id_person_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_requester_id_person_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_collector_id_person_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_line" ADD CONSTRAINT "inventory_reservation_line_reservation_id_inventory_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_line" ADD CONSTRAINT "inventory_reservation_line_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_unit" ADD CONSTRAINT "inventory_reservation_unit_line_id_inventory_reservation_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."inventory_reservation_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_unit" ADD CONSTRAINT "inventory_reservation_unit_unit_id_inventory_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_unit" ADD CONSTRAINT "inventory_unit_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_grant_source_unique" ON "inventory_grant" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "inventory_grant_person_idx" ON "inventory_grant" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "inventory_incident_reservation_idx" ON "inventory_incident" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "inventory_incident_status_idx" ON "inventory_incident" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_code_unique" ON "inventory_item" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_barcode_unique" ON "inventory_item" USING btree ("barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movement_request_unique" ON "inventory_movement" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "inventory_movement_reservation_idx" ON "inventory_movement" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "inventory_reservation_interval_idx" ON "inventory_reservation" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "inventory_reservation_requester_idx" ON "inventory_reservation" USING btree ("requester_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservation_line_unique" ON "inventory_reservation_line" USING btree ("reservation_id","item_id");--> statement-breakpoint
CREATE INDEX "inventory_reservation_line_item_idx" ON "inventory_reservation_line" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservation_unit_unique" ON "inventory_reservation_unit" USING btree ("line_id","unit_id");--> statement-breakpoint
CREATE INDEX "inventory_reservation_unit_unit_idx" ON "inventory_reservation_unit" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_unit_barcode_unique" ON "inventory_unit" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "inventory_unit_item_idx" ON "inventory_unit" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_card_uid_unique" ON "person" USING btree ("card_uid") WHERE "person"."card_uid" is not null;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_card_uid_format" CHECK ("person"."card_uid" is null or "person"."card_uid" ~ '^[0-9A-F]{2}( [0-9A-F]{2}){3}$');