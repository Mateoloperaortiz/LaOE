-- ADR-071: una participación GT de macroevento acreditada cumple el criterio GAP.
-- Solo se tocan los términos con la permanencia abierta; los semestres cerrados conservan su historia.
UPDATE "permanence_rule" r
SET "params" = jsonb_set(r."params", '{alsoCounts}', '["GT_MACROEVENT"]'::jsonb, true),
    "updated_at" = now()
FROM "term" t
WHERE t."id" = r."term_id"
  AND t."permanence_closed_at" IS NULL
  AND r."computation" = 'GROUP_EVALUATED'
  AND r."params"->>'groupKind' = 'GAP'
  AND r."params"->'alsoCounts' IS NULL;
--> statement-breakpoint
-- Un recompute por término tocado para que el criterio se refleje sin esperar al programado diario.
INSERT INTO "outbox" ("id", "event_type", "payload", "dedupe_key")
SELECT DISTINCT
  'migration0033_' || r."term_id",
  'permanence.recompute',
  jsonb_build_object('termId', r."term_id"),
  'permanence:' || r."term_id" || ':*'
FROM "permanence_rule" r
JOIN "term" t ON t."id" = r."term_id"
WHERE t."permanence_closed_at" IS NULL
  AND r."computation" = 'GROUP_EVALUATED'
  AND r."params"->>'groupKind' = 'GAP'
  AND r."params"->'alsoCounts' @> '["GT_MACROEVENT"]'::jsonb
ON CONFLICT DO NOTHING;
