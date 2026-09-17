ALTER TYPE "public"."message_kind" ADD VALUE 'WORDLE';--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "push_wordle" boolean DEFAULT true NOT NULL;