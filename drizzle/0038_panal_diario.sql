ALTER TYPE "public"."point_entry_kind" ADD VALUE 'PANAL';--> statement-breakpoint
CREATE TABLE "panal_game" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"day" date NOT NULL,
	"puzzle_id" text NOT NULL,
	"dictionary_version" text NOT NULL,
	"rules_version" text NOT NULL,
	"credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panal_word" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"word" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "panal_word_format" CHECK ("panal_word"."word" ~ '^[A-ZÑ]{4,32}$')
);
--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "panal_game_id" text;--> statement-breakpoint
ALTER TABLE "panal_game" ADD CONSTRAINT "panal_game_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panal_game" ADD CONSTRAINT "panal_game_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panal_word" ADD CONSTRAINT "panal_word_game_id_panal_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."panal_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "panal_game_person_day_unique" ON "panal_game" USING btree ("person_id","day");--> statement-breakpoint
CREATE INDEX "panal_game_term_idx" ON "panal_game" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "panal_word_game_word_unique" ON "panal_word" USING btree ("game_id","word");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_panal_game_id_panal_game_id_fk" FOREIGN KEY ("panal_game_id") REFERENCES "public"."panal_game"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_panal_game_unique" ON "point_entry" USING btree ("panal_game_id");--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_panal_consistent" CHECK (("point_entry"."kind"::text = 'PANAL') = ("point_entry"."panal_game_id" is not null));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_panal_reward" CHECK ("point_entry"."kind"::text <> 'PANAL' or "point_entry"."points" = 6);