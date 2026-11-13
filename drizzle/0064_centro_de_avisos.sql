CREATE TABLE "inbox_item" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"kind" "message_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_item_person_key_idx" ON "inbox_item" USING btree ("person_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "inbox_item_person_created_idx" ON "inbox_item" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_item_created_idx" ON "inbox_item" USING btree ("created_at");