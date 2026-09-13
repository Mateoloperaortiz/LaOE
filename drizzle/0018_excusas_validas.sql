ALTER TYPE "public"."request_kind" ADD VALUE 'EXCUSE';--> statement-breakpoint
ALTER TYPE "public"."check_in_status" ADD VALUE 'EXCUSED';--> statement-breakpoint
DROP INDEX "request_pending_unique";--> statement-breakpoint
ALTER TABLE "request" ADD COLUMN "occasion_id" text;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_occasion_id_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "request_excuse_pending_unique" ON "request" USING btree ("person_id","occasion_id") WHERE "request"."status" = 'PENDING' and "request"."occasion_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "request_pending_unique" ON "request" USING btree ("person_id","kind") WHERE "request"."status" = 'PENDING' and "request"."occasion_id" is null;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_excuse_has_occasion" CHECK (("request"."kind"::text = 'EXCUSE') = ("request"."occasion_id" is not null));