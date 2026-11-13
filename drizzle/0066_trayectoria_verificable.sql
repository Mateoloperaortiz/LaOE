CREATE TYPE "public"."trajectory_credential_kind" AS ENUM('COMMITTEE', 'RECOGNITION');--> statement-breakpoint
CREATE TABLE "trajectory_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"person_id" text NOT NULL,
	"kind" "trajectory_credential_kind" NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"term_code" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trajectory_credential" ADD CONSTRAINT "trajectory_credential_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trajectory_credential_public_id_unique" ON "trajectory_credential" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trajectory_credential_source_unique" ON "trajectory_credential" USING btree ("person_id","kind","source_id");