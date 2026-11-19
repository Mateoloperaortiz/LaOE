CREATE TABLE "inventory_loan_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"scope_label" text NOT NULL,
	"committee_id" text,
	"edition_id" text,
	"purpose" text NOT NULL,
	"event_approval_id" text,
	"event_starts_on" date NOT NULL,
	"event_ends_on" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"minutes" text NOT NULL,
	"supporting_record" text NOT NULL,
	"late_reason" text NOT NULL,
	"lines" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "board_approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decided_as" text,
	"decision_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "inventory_approval_range" CHECK ("inventory_loan_approval"."starts_at"<"inventory_loan_approval"."ends_at" and "inventory_loan_approval"."event_starts_on"<="inventory_loan_approval"."event_ends_on")
);
--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD COLUMN "approval_id" text;--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "inventory_loan_approval" ADD CONSTRAINT "inventory_loan_approval_requester_id_person_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loan_approval" ADD CONSTRAINT "inventory_loan_approval_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loan_approval" ADD CONSTRAINT "inventory_loan_approval_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loan_approval" ADD CONSTRAINT "inventory_loan_approval_event_approval_id_event_approval_id_fk" FOREIGN KEY ("event_approval_id") REFERENCES "public"."event_approval"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_loan_approval" ADD CONSTRAINT "inventory_loan_approval_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_approval_owner_idx" ON "inventory_loan_approval" USING btree ("requester_id","requested_at");--> statement-breakpoint
CREATE INDEX "inventory_approval_queue_idx" ON "inventory_loan_approval" USING btree ("status","requested_at");--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_approval_id_inventory_loan_approval_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."inventory_loan_approval"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservation_request_idx" ON "inventory_reservation" USING btree ("approval_id","request_key");