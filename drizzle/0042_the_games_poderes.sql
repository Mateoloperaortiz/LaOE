CREATE TYPE "public"."competition_power" AS ENUM('RESULT_SWAP', 'DOUBLE_POINTS', 'CANCEL_POWER', 'LATE_START', 'ONE_PLAYER_DOWN');--> statement-breakpoint
CREATE TYPE "public"."competition_power_grant_status" AS ENUM('ASSIGNED', 'DELIVERED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."competition_power_use_status" AS ENUM('ACTIVE', 'REVERTED');--> statement-breakpoint
CREATE TABLE "competition_power_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"team_id" text NOT NULL,
	"power" "competition_power" NOT NULL,
	"day" integer NOT NULL,
	"status" "competition_power_grant_status" DEFAULT 'ASSIGNED' NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivered_by_id" text,
	"voided_at" timestamp with time zone,
	"voided_by_id" text,
	"void_reason" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_power_grant_day" CHECK ("competition_power_grant"."day" in (1, 2)),
	CONSTRAINT "competition_power_grant_delivered" CHECK ("competition_power_grant"."status"::text <> 'DELIVERED' or "competition_power_grant"."delivered_at" is not null),
	CONSTRAINT "competition_power_grant_voided" CHECK (("competition_power_grant"."status"::text = 'VOIDED') = ("competition_power_grant"."voided_at" is not null)),
	CONSTRAINT "competition_power_grant_void_reason" CHECK ("competition_power_grant"."status"::text <> 'VOIDED' or char_length("competition_power_grant"."void_reason") between 2 and 200)
);
--> statement-breakpoint
CREATE TABLE "competition_power_use" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"rotation_id" text NOT NULL,
	"team_id" text NOT NULL,
	"base_id" text NOT NULL,
	"status" "competition_power_use_status" DEFAULT 'ACTIVE' NOT NULL,
	"received_by_id" text,
	"reverted_at" timestamp with time zone,
	"reverted_by_id" text,
	"revert_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_power_use_reverted" CHECK (("competition_power_use"."status"::text = 'REVERTED') = ("competition_power_use"."reverted_at" is not null)),
	CONSTRAINT "competition_power_use_revert_reason" CHECK ("competition_power_use"."status"::text <> 'REVERTED' or char_length("competition_power_use"."revert_reason") between 2 and 200)
);
--> statement-breakpoint
ALTER TABLE "competition_matchup" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competition_matchup" ADD COLUMN "started_by_id" text;--> statement-breakpoint
ALTER TABLE "competition_result" ADD COLUMN "official_outcome" "competition_outcome";--> statement-breakpoint
ALTER TABLE "competition_result" ADD COLUMN "power_detail" jsonb;--> statement-breakpoint
ALTER TABLE "competition_power_grant" ADD CONSTRAINT "competition_power_grant_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_grant" ADD CONSTRAINT "competition_power_grant_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_grant" ADD CONSTRAINT "competition_power_grant_delivered_by_id_person_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_grant" ADD CONSTRAINT "competition_power_grant_voided_by_id_person_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_grant" ADD CONSTRAINT "competition_power_grant_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_use" ADD CONSTRAINT "competition_power_use_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_use" ADD CONSTRAINT "competition_power_use_grant_id_competition_power_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."competition_power_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_use" ADD CONSTRAINT "competition_power_use_rotation_id_competition_rotation_id_fk" FOREIGN KEY ("rotation_id") REFERENCES "public"."competition_rotation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_use" ADD CONSTRAINT "competition_power_use_team_id_competition_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."competition_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_use" ADD CONSTRAINT "competition_power_use_base_id_competition_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."competition_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_use" ADD CONSTRAINT "competition_power_use_received_by_id_person_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_power_use" ADD CONSTRAINT "competition_power_use_reverted_by_id_person_id_fk" FOREIGN KEY ("reverted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_power_grant_team_idx" ON "competition_power_grant" USING btree ("competition_id","team_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_power_use_grant_unique" ON "competition_power_use" USING btree ("grant_id") WHERE "competition_power_use"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "competition_power_use_team_unique" ON "competition_power_use" USING btree ("rotation_id","team_id") WHERE "competition_power_use"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "competition_power_use_team_idx" ON "competition_power_use" USING btree ("competition_id","team_id");--> statement-breakpoint
ALTER TABLE "competition_matchup" ADD CONSTRAINT "competition_matchup_started_by_id_person_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_result" ADD CONSTRAINT "competition_result_power_detail" CHECK (("competition_result"."official_outcome" is null) = ("competition_result"."power_detail" is null));