ALTER TYPE "public"."message_kind" ADD VALUE 'GAMER_STREAK';--> statement-breakpoint
ALTER TYPE "public"."point_entry_kind" ADD VALUE 'PRESENCE_STREAK';--> statement-breakpoint
CREATE TABLE "presence_bonus" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"week_key" date NOT NULL,
	"version" integer NOT NULL,
	"streak_weeks" integer NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presence_bonus_positive_version" CHECK ("presence_bonus"."version" > 0),
	CONSTRAINT "presence_bonus_streak" CHECK ("presence_bonus"."streak_weeks" >= 2),
	CONSTRAINT "presence_bonus_points" CHECK ("presence_bonus"."points" in (2, 3, 5))
);
--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "push_gamer_streak" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "occasion" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "presence_bonus_id" text;--> statement-breakpoint
ALTER TABLE "term_standing" ADD COLUMN "top_gamer" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "presence_bonus" ADD CONSTRAINT "presence_bonus_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_bonus" ADD CONSTRAINT "presence_bonus_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presence_bonus_week_version_unique" ON "presence_bonus" USING btree ("person_id","term_id","week_key","version");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_presence_bonus_id_presence_bonus_id_fk" FOREIGN KEY ("presence_bonus_id") REFERENCES "public"."presence_bonus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_presence_bonus_unique" ON "point_entry" USING btree ("presence_bonus_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_presence_bonus_consistent" CHECK (("point_entry"."kind"::text = 'PRESENCE_STREAK') = ("point_entry"."presence_bonus_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_presence_bonus_points" CHECK ("point_entry"."kind"::text <> 'PRESENCE_STREAK' or "point_entry"."points" in (2, 3, 5));
--> statement-breakpoint
-- El ledger anterior permanece intacto. Los juegos se separan mediante una proyección por origen.
-- De la programación histórica conocemos creación/estado, pero no el instante en que se abrió.
UPDATE "occasion" SET "opened_at" = "created_at" WHERE "status" IN ('OPEN', 'CLOSED') AND "opened_at" IS NULL;
--> statement-breakpoint
INSERT INTO "app_config" ("key", "value") VALUES
  ('presenceStreak.launchedAt', to_jsonb(to_char(current_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
UPDATE "app_config" SET "value" = '[0,25,75,150,250]'::jsonb, "updated_at" = current_timestamp
WHERE "key" = 'points.levels';
