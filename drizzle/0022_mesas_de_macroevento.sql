ALTER TYPE "public"."appointment_kind" ADD VALUE 'MACROEVENT_DIRECTOR' BEFORE 'OTHER';--> statement-breakpoint
CREATE TABLE "macroevent_role" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "edition_id" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "role_code" text;--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "co_director" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_role_code_macroevent_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."macroevent_role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_edition_idx" ON "appointment" USING btree ("edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_edition_titular_unique" ON "appointment" USING btree ("edition_id","role_code") WHERE "appointment"."edition_id" is not null and "appointment"."co_director" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_edition_codireccion_unique" ON "appointment" USING btree ("edition_id","role_code") WHERE "appointment"."edition_id" is not null and "appointment"."co_director" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_edition_person_unique" ON "appointment" USING btree ("edition_id","person_id") WHERE "appointment"."edition_id" is not null;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_macroevent_consistent" CHECK (("appointment"."kind"::text = 'MACROEVENT_DIRECTOR') = ("appointment"."edition_id" is not null and "appointment"."role_code" is not null));--> statement-breakpoint
INSERT INTO "macroevent_role" ("code", "label", "sort_order") VALUES
	('GENERAL', 'Dirección General', 1),
	('LOGISTICA', 'Dirección de Logística', 2),
	('FINANZAS', 'Dirección de Finanzas', 3),
	('MERCADEO', 'Dirección de Mercadeo', 4),
	('PUBLICIDAD', 'Dirección de Publicidad', 5),
	('GESTION_HUMANA', 'Dirección de Gestión Humana', 6),
	('THE_GAMES', 'Dirección de The Games', 7),
	('CARNIVAL', 'Dirección de Carnival', 8),
	('SEGURIDAD', 'Dirección de Seguridad', 9),
	('AGENDA_ACADEMICA', 'Dirección de Agenda Académica', 10);
