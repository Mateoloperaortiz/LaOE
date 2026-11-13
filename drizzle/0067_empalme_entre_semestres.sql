CREATE TABLE "handover_doc" (
	"id" text PRIMARY KEY NOT NULL,
	"committee_id" text NOT NULL,
	"role_code" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_by_id" text,
	"verified_by_id" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handover_doc" ADD CONSTRAINT "handover_doc_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_doc" ADD CONSTRAINT "handover_doc_role_code_committee_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."committee_role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_doc" ADD CONSTRAINT "handover_doc_updated_by_id_person_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_doc" ADD CONSTRAINT "handover_doc_verified_by_id_person_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "handover_doc_committee_role_unique" ON "handover_doc" USING btree ("committee_id","role_code");