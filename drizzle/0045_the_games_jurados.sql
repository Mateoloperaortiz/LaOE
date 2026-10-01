CREATE TABLE "competition_extra_jury_score" (
	"id" text PRIMARY KEY NOT NULL,
	"extra_id" text NOT NULL,
	"team_id" text NOT NULL,
	"judge" text NOT NULL,
	"scores" integer[] NOT NULL,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_extra_jury_score_scores" CHECK (cardinality("competition_extra_jury_score"."scores") = 5 and 1 <= all("competition_extra_jury_score"."scores") and 10 >= all("competition_extra_jury_score"."scores")),
	CONSTRAINT "competition_extra_jury_score_judge" CHECK (char_length("competition_extra_jury_score"."judge") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "competition_extra_jury_score" ADD CONSTRAINT "competition_extra_jury_score_extra_id_competition_extra_id_fk" FOREIGN KEY ("extra_id") REFERENCES "public"."competition_extra"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_extra_jury_score" ADD CONSTRAINT "competition_extra_jury_score_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_extra_jury_score" ADD CONSTRAINT "competition_extra_jury_score_recorded_by_id_person_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_extra_jury_score_unique" ON "competition_extra_jury_score" USING btree ("extra_id",lower("judge"),"team_id");--> statement-breakpoint
CREATE INDEX "competition_extra_jury_score_team_idx" ON "competition_extra_jury_score" USING btree ("team_id");