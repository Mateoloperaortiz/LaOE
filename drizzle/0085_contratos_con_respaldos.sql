CREATE TABLE "finance_contract" (
	"id" text PRIMARY KEY NOT NULL,
	"committee_id" text NOT NULL,
	"title" text NOT NULL,
	"supplier" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"files" jsonb NOT NULL,
	"requested_by_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "board_approval_status" DEFAULT 'PENDING' NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decided_seat" text,
	"decision_note" text DEFAULT '' NOT NULL,
	CONSTRAINT "finance_contract_amount" CHECK ("finance_contract"."amount" > 0),
	CONSTRAINT "finance_contract_files" CHECK (jsonb_typeof("finance_contract"."files") = 'object' and "finance_contract"."files" ?& array['contract','legal','coordinator']),
	CONSTRAINT "finance_contract_decision" CHECK (("finance_contract"."status" = 'PENDING' and "finance_contract"."decided_at" is null and "finance_contract"."decided_seat" is null) or ("finance_contract"."status" <> 'PENDING' and "finance_contract"."decided_at" is not null and "finance_contract"."decided_seat" is not null and "finance_contract"."decided_seat" in ('PRESIDENT','VP_FINANCE')))
);
--> statement-breakpoint
ALTER TABLE "finance_contract" ADD CONSTRAINT "finance_contract_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_contract" ADD CONSTRAINT "finance_contract_requested_by_id_person_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_contract" ADD CONSTRAINT "finance_contract_decided_by_id_person_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_contract_committee_idx" ON "finance_contract" USING btree ("committee_id","requested_at");--> statement-breakpoint
CREATE INDEX "finance_contract_queue_idx" ON "finance_contract" USING btree ("status","requested_at");