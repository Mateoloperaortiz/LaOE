CREATE TABLE "creative_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"committee_id" text NOT NULL,
	"title" text NOT NULL,
	"channel" text,
	"caption" text DEFAULT '' NOT NULL,
	"file_name" text NOT NULL,
	"digest" text NOT NULL,
	"status" "board_approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by_id" text,
	"decided_at" timestamp with time zone,
	"decided_by_id" text,
	"decided_as" text,
	"decision_note" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_id" text,
	CONSTRAINT "creative_approval_digest" CHECK ("creative_approval"."digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "creative_approval_publication" CHECK ("creative_approval"."published_at" is null or "creative_approval"."status" = 'APPROVED'),
	CONSTRAINT "creative_approval_decision" CHECK (
      ("creative_approval"."status" = 'PENDING' and "creative_approval"."decided_at" is null and "creative_approval"."decided_as" is null)
      or ("creative_approval"."status" <> 'PENDING' and "creative_approval"."decided_at" is not null and
          "creative_approval"."decided_as" is not null and "creative_approval"."decided_as" in ('HOLDER','PRESIDENCY'))
    )
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "creative_approval_id" text;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD CONSTRAINT "creative_approval_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD CONSTRAINT "creative_approval_requested_by_id_person_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD CONSTRAINT "creative_approval_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD CONSTRAINT "creative_approval_published_by_id_person_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_approval_committee_idx" ON "creative_approval" USING btree ("committee_id","requested_at");--> statement-breakpoint
CREATE INDEX "creative_approval_queue_idx" ON "creative_approval" USING btree ("status","requested_at");--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_creative_approval_id_creative_approval_id_fk" FOREIGN KEY ("creative_approval_id") REFERENCES "public"."creative_approval"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_creative_unique" ON "announcement" USING btree ("creative_approval_id");--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_creative_audience" CHECK ("announcement"."creative_approval_id" is null or ("announcement"."committee_id" is not null and "announcement"."audience" = 'MEMBERS'));