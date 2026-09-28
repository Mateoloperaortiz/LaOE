CREATE TABLE "competition_team_captain" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_team_captain_position_range" CHECK ("competition_team_captain"."position" between 1 and 2),
	CONSTRAINT "competition_team_captain_name_length" CHECK (char_length("competition_team_captain"."name") between 1 and 80),
	CONSTRAINT "competition_team_captain_phone_format" CHECK ("competition_team_captain"."phone" is null or "competition_team_captain"."phone" ~ '^[0-9]{10}$')
);
--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "show_captains" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_team_captain" ADD CONSTRAINT "competition_team_captain_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_team_captain_position_unique" ON "competition_team_captain" USING btree ("team_id","position");