CREATE TYPE "public"."prediction_market_status" AS ENUM('DRAFT', 'OPEN', 'RESOLVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."prediction_ticket_status" AS ENUM('OPEN', 'WON', 'LOST', 'REFUNDED');--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'PREDICTION_STAKE';--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'PREDICTION_PAYOUT';--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'PREDICTION_REFUND';--> statement-breakpoint
CREATE TABLE "prediction_market" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "prediction_market_status" DEFAULT 'DRAFT' NOT NULL,
	"winning_option_id" text,
	"created_by_id" text,
	"resolved_by_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_market_resolved_consistent" CHECK (("prediction_market"."status"::text = 'RESOLVED') = ("prediction_market"."winning_option_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "prediction_option" (
	"id" text PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_pick" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"market_id" text NOT NULL,
	"option_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"match_cap" integer NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_settings_cap_positive" CHECK ("prediction_settings"."match_cap" > 0)
);
--> statement-breakpoint
CREATE TABLE "prediction_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"occasion_id" text NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"stake" integer NOT NULL,
	"status" "prediction_ticket_status" DEFAULT 'OPEN' NOT NULL,
	"payout" integer,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_ticket_stake_positive" CHECK ("prediction_ticket"."stake" > 0),
	CONSTRAINT "prediction_ticket_settled_consistent" CHECK (("prediction_ticket"."status"::text = 'OPEN') = ("prediction_ticket"."settled_at" is null))
);
--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "prediction_ticket_id" text;--> statement-breakpoint
ALTER TABLE "prediction_market" ADD CONSTRAINT "prediction_market_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_market" ADD CONSTRAINT "prediction_market_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_market" ADD CONSTRAINT "prediction_market_resolved_by_id_person_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_option" ADD CONSTRAINT "prediction_option_market_id_prediction_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_pick" ADD CONSTRAINT "prediction_pick_ticket_id_prediction_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."prediction_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_pick" ADD CONSTRAINT "prediction_pick_market_id_prediction_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."prediction_market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_pick" ADD CONSTRAINT "prediction_pick_option_id_prediction_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."prediction_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_settings" ADD CONSTRAINT "prediction_settings_updated_by_id_person_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_ticket" ADD CONSTRAINT "prediction_ticket_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_ticket" ADD CONSTRAINT "prediction_ticket_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_ticket" ADD CONSTRAINT "prediction_ticket_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prediction_market_occasion_idx" ON "prediction_market" USING btree ("occasion_id");--> statement-breakpoint
CREATE INDEX "prediction_option_market_idx" ON "prediction_option" USING btree ("market_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "prediction_pick_ticket_market_unique" ON "prediction_pick" USING btree ("ticket_id","market_id");--> statement-breakpoint
CREATE INDEX "prediction_pick_market_idx" ON "prediction_pick" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "prediction_ticket_occasion_idx" ON "prediction_ticket" USING btree ("occasion_id","status");--> statement-breakpoint
CREATE INDEX "prediction_ticket_person_idx" ON "prediction_ticket" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_prediction_kind_unique" ON "point_entry" USING btree ("prediction_ticket_id","kind") WHERE "point_entry"."prediction_ticket_id" is not null;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_prediction_consistent" CHECK (("point_entry"."kind"::text like 'PREDICTION_%') = ("point_entry"."prediction_ticket_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_prediction_sign" CHECK ("point_entry"."kind"::text not like 'PREDICTION_%' or ("point_entry"."kind"::text = 'PREDICTION_STAKE') = ("point_entry"."points" < 0));