CREATE TABLE "budget_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"year" integer NOT NULL,
	"proposal" jsonb NOT NULL,
	"status" "board_approval_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decided_as" text,
	"decision_note" text DEFAULT '' NOT NULL,
	"transfer_id" text,
	CONSTRAINT "budget_approval_kind" CHECK ("budget_approval"."proposal"->>'kind' in ('TRANSFER','EXTRAORDINARY')),
	CONSTRAINT "budget_approval_decision" CHECK (("budget_approval"."status" = 'PENDING') = ("budget_approval"."decided_at" is null)),
	CONSTRAINT "budget_approval_authority" CHECK (("budget_approval"."status" = 'PENDING' and "budget_approval"."decided_as" is null) or ("budget_approval"."status" <> 'PENDING' and "budget_approval"."decided_as" is not null and "budget_approval"."decided_as" in ('HOLDER','PRESIDENCY'))),
	CONSTRAINT "budget_approval_posted" CHECK (("budget_approval"."status" = 'APPROVED' and "budget_approval"."proposal"->>'kind' = 'TRANSFER') = ("budget_approval"."transfer_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_budget_id_committee_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."committee_budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_requested_by_id_person_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_transfer_id_budget_transfer_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."budget_transfer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_approval_queue_idx" ON "budget_approval" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "budget_approval_budget_idx" ON "budget_approval" USING btree ("budget_id","committee_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_approval_transfer_unique" ON "budget_approval" USING btree ("transfer_id");