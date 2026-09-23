ALTER TABLE "point_entry" DROP CONSTRAINT "point_entry_panal_reward";--> statement-breakpoint
DROP INDEX "point_entry_panal_game_unique";--> statement-breakpoint
ALTER TABLE "point_entry" ADD COLUMN "panal_checkpoint" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_panal_checkpoint_unique" ON "point_entry" USING btree ("panal_game_id","panal_checkpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "point_entry_panal_game_unique" ON "point_entry" USING btree ("panal_game_id") WHERE "point_entry"."panal_checkpoint" is null;--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_panal_checkpoint_consistent" CHECK ("point_entry"."panal_checkpoint" is null or ("point_entry"."kind"::text = 'PANAL' and "point_entry"."panal_checkpoint" between 1 and 3));--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_panal_reward" CHECK ("point_entry"."kind"::text <> 'PANAL' or ("point_entry"."panal_checkpoint" is null and "point_entry"."points" = 6) or ("point_entry"."panal_checkpoint" is not null and "point_entry"."points" = "point_entry"."panal_checkpoint"));