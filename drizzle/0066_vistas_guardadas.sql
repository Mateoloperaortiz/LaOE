CREATE TABLE "saved_view" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"base_path" text NOT NULL,
	"name" text NOT NULL,
	"query" text DEFAULT '' NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_owner_id_person_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_owner_table_name_unique" ON "saved_view" USING btree ("owner_id","base_path","name");--> statement-breakpoint
CREATE INDEX "saved_view_table_idx" ON "saved_view" USING btree ("base_path");