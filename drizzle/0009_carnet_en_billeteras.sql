CREATE TYPE "public"."wallet_platform" AS ENUM('APPLE', 'GOOGLE');--> statement-breakpoint
CREATE TABLE "carnet_token" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"token" text NOT NULL,
	"wallet_epoch" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallet_pass" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"platform" "wallet_platform" NOT NULL,
	"external_id" text NOT NULL,
	"wallet_epoch" integer NOT NULL,
	"token_revision" integer NOT NULL,
	"rendered_term_id" text,
	"issued_at" timestamp with time zone,
	"last_issued_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "wallet_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "carnet_token" ADD CONSTRAINT "carnet_token_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_pass" ADD CONSTRAINT "wallet_pass_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_pass" ADD CONSTRAINT "wallet_pass_rendered_term_id_term_id_fk" FOREIGN KEY ("rendered_term_id") REFERENCES "public"."term"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "carnet_token_person_unique" ON "carnet_token" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carnet_token_token_unique" ON "carnet_token" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_pass_person_platform_unique" ON "wallet_pass" USING btree ("person_id","platform");