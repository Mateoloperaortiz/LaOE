CREATE TYPE "public"."message_channel" AS ENUM('EMAIL', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"channel" "message_channel" NOT NULL,
	"campaign_id" text,
	"subject" text NOT NULL,
	"status" "message_status" NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_person_idx" ON "message" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "message_provider_idx" ON "message" USING btree ("provider","created_at");