CREATE TABLE "creative_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"piece_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_approval" ADD COLUMN "marketing_assignment_id" text;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD COLUMN "marketing_director_id" text;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD COLUMN "marketing_term_id" text;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD COLUMN "channel_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_feedback" ADD CONSTRAINT "creative_feedback_piece_id_creative_approval_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."creative_approval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_feedback" ADD CONSTRAINT "creative_feedback_author_id_person_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_feedback_piece_idx" ON "creative_feedback" USING btree ("piece_id","created_at");--> statement-breakpoint
ALTER TABLE "creative_approval" ADD CONSTRAINT "creative_approval_marketing_assignment_id_committee_role_assignment_id_fk" FOREIGN KEY ("marketing_assignment_id") REFERENCES "public"."committee_role_assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD CONSTRAINT "creative_approval_marketing_director_id_person_id_fk" FOREIGN KEY ("marketing_director_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_approval" ADD CONSTRAINT "creative_approval_marketing_term_id_term_id_fk" FOREIGN KEY ("marketing_term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_mentoring_order_idx" ON "creative_approval" USING btree ("marketing_term_id","marketing_assignment_id","published_at","id");