CREATE TYPE "public"."document_unit_type" AS ENUM('ARTICLE', 'SECTION');--> statement-breakpoint
ALTER TABLE "document_article" ALTER COLUMN "number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "content_sha256" text;--> statement-breakpoint
ALTER TABLE "document_article" ADD COLUMN "unit_type" "document_unit_type" DEFAULT 'ARTICLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_article" ADD COLUMN "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "document_article" SET "blocks" = jsonb_build_array(jsonb_build_object('type', 'text', 'text', "body"));--> statement-breakpoint
ALTER TABLE "document_article" ADD CONSTRAINT "document_article_number_check" CHECK (("document_article"."unit_type" = 'ARTICLE' AND "document_article"."number" IS NOT NULL) OR ("document_article"."unit_type" = 'SECTION' AND "document_article"."number" IS NULL));
