CREATE TABLE "committee_role_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"person_id" text NOT NULL,
	"committee_id" text NOT NULL,
	"term_id" text NOT NULL,
	"role_code" text NOT NULL,
	"co_director" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "committee_membership_one_general";--> statement-breakpoint
ALTER TABLE "committee_role" ADD COLUMN "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "committee_role" ADD COLUMN "capabilities" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "committee_role_assignment" ADD CONSTRAINT "committee_role_assignment_membership_id_committee_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."committee_membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_role_assignment" ADD CONSTRAINT "committee_role_assignment_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_role_assignment" ADD CONSTRAINT "committee_role_assignment_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_role_assignment" ADD CONSTRAINT "committee_role_assignment_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_role_assignment" ADD CONSTRAINT "committee_role_assignment_role_code_committee_role_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."committee_role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "committee_role_assignment_titular_unique" ON "committee_role_assignment" USING btree ("committee_id","term_id","role_code") WHERE "committee_role_assignment"."co_director" = false and "committee_role_assignment"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "committee_role_assignment_codireccion_unique" ON "committee_role_assignment" USING btree ("committee_id","term_id","role_code") WHERE "committee_role_assignment"."co_director" = true and "committee_role_assignment"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "committee_role_assignment_membership_role_unique" ON "committee_role_assignment" USING btree ("membership_id","role_code") WHERE "committee_role_assignment"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "committee_role_assignment_person_term_idx" ON "committee_role_assignment" USING btree ("person_id","term_id");--> statement-breakpoint
CREATE INDEX "committee_role_assignment_committee_term_idx" ON "committee_role_assignment" USING btree ("committee_id","term_id");--> statement-breakpoint
-- Datos (ADR-058): los seis cargos distintos de MIEMBRO son dirección, General y Financiero son
-- obligatorios, cada cargo recibe sus capacidades por defecto y Mercadeo entra al catálogo.
UPDATE "committee_role" SET "is_leadership" = true WHERE "code" IN ('FINANCIERO', 'PUBLICIDAD', 'RELACIONES_PUBLICAS', 'LOGISTICA', 'GESTION_HUMANA');--> statement-breakpoint
UPDATE "committee_role" SET "required" = true WHERE "code" IN ('GENERAL', 'FINANCIERO');--> statement-breakpoint
UPDATE "committee_role" SET "capabilities" = '{ROSTER,DIRECTION,PERMANENCE,OCCASIONS,EVENTS,BOARD,PROFILE,PARTNERS,FINANCE}'::text[] WHERE "code" = 'GENERAL';--> statement-breakpoint
UPDATE "committee_role" SET "capabilities" = '{ROSTER,PERMANENCE}'::text[] WHERE "code" = 'GESTION_HUMANA';--> statement-breakpoint
UPDATE "committee_role" SET "capabilities" = '{OCCASIONS,EVENTS}'::text[] WHERE "code" = 'LOGISTICA';--> statement-breakpoint
UPDATE "committee_role" SET "capabilities" = '{BOARD,PROFILE}'::text[] WHERE "code" = 'PUBLICIDAD';--> statement-breakpoint
UPDATE "committee_role" SET "capabilities" = '{PARTNERS}'::text[] WHERE "code" = 'RELACIONES_PUBLICAS';--> statement-breakpoint
UPDATE "committee_role" SET "capabilities" = '{FINANCE,PARTNERS}'::text[] WHERE "code" = 'FINANCIERO';--> statement-breakpoint
INSERT INTO "committee_role" ("code", "label", "is_leadership", "required", "capabilities", "sort_order")
  VALUES ('MERCADEO', 'Mercadeo', true, false, '{BOARD,PROFILE}'::text[], 7)
  ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Cada pertenencia con un cargo distinto de MIEMBRO pasa a tener su cargo asignado como titular; las
-- pertenencias cerradas quedan con el cargo cerrado en la misma fecha.
INSERT INTO "committee_role_assignment" ("id", "membership_id", "person_id", "committee_id", "term_id", "role_code", "co_director", "started_at", "ended_at", "created_at")
  SELECT gen_random_uuid()::text, "id", "person_id", "committee_id", "term_id", "role_code", false, coalesce("joined_at", "created_at"), "left_at", "created_at"
  FROM "committee_membership"
  WHERE "role_code" <> 'MIEMBRO'
  ON CONFLICT DO NOTHING;
