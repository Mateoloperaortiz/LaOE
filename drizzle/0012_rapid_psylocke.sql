ALTER TABLE "person" ADD COLUMN "document_type" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "document_number" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "epik_id" text;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_document_type_known" CHECK ("person"."document_type" in ('CC', 'TI', 'CE', 'PPT'));