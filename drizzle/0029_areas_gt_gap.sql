ALTER TABLE "work_group_membership" ADD COLUMN "areas" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
UPDATE work_group g SET event_id = e.event_id FROM event_edition e
WHERE g.kind = 'GAP' AND g.event_id IS NULL AND g.edition_id = e.id;--> statement-breakpoint
CREATE UNIQUE INDEX "work_group_gap_macroevent_term_unique" ON "work_group" USING btree ("term_id","event_id") WHERE "work_group"."kind" = 'GAP' and "work_group"."event_id" is not null;