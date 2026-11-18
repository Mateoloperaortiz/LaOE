ALTER TABLE "budget_approval" DROP CONSTRAINT "budget_approval_kind";--> statement-breakpoint
ALTER TABLE "budget_approval" ADD COLUMN "expense_id" text;--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_expense_id_budget_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."budget_expense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_approval_expense_unique" ON "budget_approval" USING btree ("expense_id");--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_purchase_paid" CHECK ("budget_approval"."expense_id" is null or ("budget_approval"."status" = 'APPROVED' and "budget_approval"."proposal"->>'kind' = 'PURCHASE'));--> statement-breakpoint
ALTER TABLE "budget_approval" ADD CONSTRAINT "budget_approval_kind" CHECK ("budget_approval"."proposal"->>'kind' in ('TRANSFER','EXTRAORDINARY','PURCHASE'));