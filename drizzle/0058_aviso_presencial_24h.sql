CREATE TABLE "presence_notice_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"effective_at" timestamp with time zone,
	CONSTRAINT "presence_notice_policy_singleton" CHECK ("presence_notice_policy"."id" = 'NOTICE_24H')
);
--> statement-breakpoint
-- Preparar la estructura no activa la regla: la vigencia se fija tras SUCCESS y retiro del escritor viejo.
INSERT INTO "presence_notice_policy" ("id", "effective_at") VALUES ('NOTICE_24H', NULL)
ON CONFLICT ("id") DO NOTHING;
