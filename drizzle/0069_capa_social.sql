CREATE TYPE "public"."collective_goal_metric" AS ENUM('CHECKINS', 'CHALLENGES', 'GAMES');--> statement-breakpoint
CREATE TYPE "public"."league_tier" AS ENUM('BRONCE', 'PLATA', 'ORO', 'DIAMANTE');--> statement-breakpoint
CREATE TABLE "applause" (
	"id" text PRIMARY KEY NOT NULL,
	"from_person_id" text NOT NULL,
	"to_person_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"term_id" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applause_not_self" CHECK ("applause"."from_person_id" <> "applause"."to_person_id")
);
--> statement-breakpoint
CREATE TABLE "collective_goal" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"metric" "collective_goal_metric" NOT NULL,
	"target" integer NOT NULL,
	"committee_id" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collective_goal_target_positive" CHECK ("collective_goal"."target" > 0),
	CONSTRAINT "collective_goal_dates_ordered" CHECK ("collective_goal"."ends_on" >= "collective_goal"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "league_standing" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"week_start" date NOT NULL,
	"tier" "league_tier" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threshold_reward" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"points" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threshold_reward_points_positive" CHECK ("threshold_reward"."points" > 0)
);
--> statement-breakpoint
CREATE TABLE "threshold_reward_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"reward_id" text NOT NULL,
	"person_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "social_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "applause" ADD CONSTRAINT "applause_from_person_id_person_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applause" ADD CONSTRAINT "applause_to_person_id_person_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applause" ADD CONSTRAINT "applause_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applause" ADD CONSTRAINT "applause_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collective_goal" ADD CONSTRAINT "collective_goal_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_standing" ADD CONSTRAINT "league_standing_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threshold_reward" ADD CONSTRAINT "threshold_reward_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threshold_reward_claim" ADD CONSTRAINT "threshold_reward_claim_reward_id_threshold_reward_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."threshold_reward"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threshold_reward_claim" ADD CONSTRAINT "threshold_reward_claim_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applause_committee_idx" ON "applause" USING btree ("committee_id","created_at");--> statement-breakpoint
CREATE INDEX "applause_to_idx" ON "applause" USING btree ("to_person_id","created_at");--> statement-breakpoint
CREATE INDEX "applause_from_idx" ON "applause" USING btree ("from_person_id","created_at");--> statement-breakpoint
CREATE INDEX "collective_goal_dates_idx" ON "collective_goal" USING btree ("starts_on","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "league_standing_person_week_unique" ON "league_standing" USING btree ("person_id","week_start");--> statement-breakpoint
CREATE INDEX "league_standing_week_tier_idx" ON "league_standing" USING btree ("week_start","tier");--> statement-breakpoint
CREATE UNIQUE INDEX "threshold_reward_term_title_unique" ON "threshold_reward" USING btree ("term_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "threshold_reward_claim_unique" ON "threshold_reward_claim" USING btree ("reward_id","person_id");