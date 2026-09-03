-- Extensión y búsqueda por similitud para la paleta ⌘K (ADR-017) y catálogos de referencia.
-- Los catálogos son datos del sistema, no seed: viven en la migración para que db:release los garantice.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_full_name_trgm_idx" ON "person" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_email_trgm_idx" ON "person" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_name_trgm_idx" ON "committee" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
INSERT INTO "committee_role" ("code", "label", "is_leadership", "sort_order") VALUES
  ('GENERAL', 'General', true, 1),
  ('FINANCIERO', 'Financiero', false, 2),
  ('PUBLICIDAD', 'Publicidad', false, 3),
  ('RELACIONES_PUBLICAS', 'Relaciones Públicas', false, 4),
  ('LOGISTICA', 'Logística', false, 5),
  ('GESTION_HUMANA', 'Gestión Humana', false, 6),
  ('MIEMBRO', 'Miembro', false, 99)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "app_config" ("key", "value") VALUES
  ('committees.min', '1'),
  ('committees.max', '3'),
  ('assemblies.requiredOrdinary', '1'),
  ('permanence.assembliesForCredit', '3'),
  ('score.shrinkK', '5'),
  ('checkin.rotatingCodeDefault', 'false'),
  ('permanence.threshold.active', '60'),
  ('permanence.threshold.new', '80'),
  ('permanence.threshold.probation', '80'),
  ('permanence.threshold.transfer', '70'),
  ('permanence.probationMargin', '10'),
  ('privacy.policyVersion', '"pendiente"')
ON CONFLICT ("key") DO NOTHING;
