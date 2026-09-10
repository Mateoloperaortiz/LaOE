CREATE TYPE "public"."access_grant_kind" AS ENUM('ACTIVATION', 'RECOVERY');--> statement-breakpoint
CREATE TABLE "access_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"kind" "access_grant_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"issued_by_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"succeeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grant" ADD CONSTRAINT "access_grant_issued_by_id_person_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grant_token_hash_unique" ON "access_grant" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_grant_person_idx" ON "access_grant" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "access_grant_expires_idx" ON "access_grant" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_person_unique" ON "credential" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "login_attempt_email_idx" ON "login_attempt" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempt_ip_idx" ON "login_attempt" USING btree ("ip","created_at");