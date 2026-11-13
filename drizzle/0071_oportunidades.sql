CREATE TYPE "public"."opportunity_audience" AS ENUM('MEMBERS', 'ALUMNI', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."opportunity_kind" AS ENUM('INTERNSHIP', 'JOB', 'VOLUNTEER', 'EVENT', 'OTHER');--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" "opportunity_kind" DEFAULT 'OTHER' NOT NULL,
	"audience" "opportunity_audience" DEFAULT 'BOTH' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"url" text,
	"closes_on" date,
	"status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_status_closes_idx" ON "opportunity" USING btree ("status","closes_on");--> statement-breakpoint
CREATE INDEX "opportunity_organization_idx" ON "opportunity" USING btree ("organization_id");