CREATE TABLE "push_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"subscription_id" text,
	"status" "message_status" DEFAULT 'FAILED' NOT NULL,
	"retryable" boolean DEFAULT true NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_delivery_sent_result" CHECK (("push_delivery"."status" = 'SENT') = ("push_delivery"."sent_at" is not null) and ("push_delivery"."status" != 'SENT' or not "push_delivery"."retryable"))
);
--> statement-breakpoint
ALTER TABLE "push_delivery" ADD CONSTRAINT "push_delivery_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_delivery" ADD CONSTRAINT "push_delivery_subscription_id_push_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_delivery_message_subscription_unique" ON "push_delivery" USING btree ("message_id","subscription_id");--> statement-breakpoint
CREATE INDEX "push_delivery_subscription_idx" ON "push_delivery" USING btree ("subscription_id");