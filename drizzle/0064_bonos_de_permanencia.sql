CREATE TABLE "permanence_bonus" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"person_id" text NOT NULL,
	"request_id" text NOT NULL,
	"reason" text NOT NULL,
	"granted_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permanence_bonus_reason_length" CHECK (char_length(btrim("permanence_bonus"."reason")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "permanence_bonus_allocation" (
	"bonus_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"value" numeric(6, 2) NOT NULL,
	CONSTRAINT "permanence_bonus_allocation_bonus_id_rule_id_pk" PRIMARY KEY("bonus_id","rule_id"),
	CONSTRAINT "permanence_bonus_allocation_positive" CHECK ("permanence_bonus_allocation"."value" > 0)
);
--> statement-breakpoint
ALTER TABLE "permanence_bonus" ADD CONSTRAINT "permanence_bonus_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_bonus" ADD CONSTRAINT "permanence_bonus_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_bonus" ADD CONSTRAINT "permanence_bonus_granted_by_id_person_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_bonus_allocation" ADD CONSTRAINT "permanence_bonus_allocation_bonus_id_permanence_bonus_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."permanence_bonus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanence_bonus_allocation" ADD CONSTRAINT "permanence_bonus_allocation_rule_id_permanence_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."permanence_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permanence_bonus_request_unique" ON "permanence_bonus" USING btree ("person_id","term_id","request_id");--> statement-breakpoint
CREATE INDEX "permanence_bonus_allocation_rule_idx" ON "permanence_bonus_allocation" USING btree ("rule_id");