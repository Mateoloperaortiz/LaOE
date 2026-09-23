ALTER TABLE "point_entry" DROP CONSTRAINT "point_entry_reward_range";--> statement-breakpoint
ALTER TABLE "reward" DROP CONSTRAINT "reward_base_points_range";--> statement-breakpoint
ALTER TABLE "point_entry" ADD CONSTRAINT "point_entry_reward_range" CHECK (("point_entry"."kind"::text <> 'CHALLENGE' or "point_entry"."points" between 1 and 20)
        and ("point_entry"."kind"::text <> 'BOOST' or "point_entry"."points" between 1 and 1000));--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_base_points_range" CHECK ("reward"."base_points" >= 0 and ("reward"."source" <> 'CHALLENGE' or "reward"."base_points" <= 20));