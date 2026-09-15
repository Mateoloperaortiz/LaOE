-- ADR-068: una insignia revocada no puede reservar una posición de la colección.
UPDATE "achievement" SET "featured_position" = NULL
WHERE "revoked_at" IS NOT NULL AND "featured_position" IS NOT NULL;
--> statement-breakpoint
-- Las evidencias de una instalación anterior deben pasar al objeto protegido del servidor.
-- Se ocultan mientras se reprocesan; ninguna URL vuelve a servir el objeto de subida original.
INSERT INTO "outbox" ("id", "event_type", "payload", "dedupe_key")
SELECT 'migration0032_' || "id", 'gamification.evidence-process',
  jsonb_build_object('fileId', "id"), 'evidence-protected:' || "id"
FROM "challenge_evidence_file" WHERE "status" = 'READY'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "challenge_evidence_file" SET "status" = 'PENDING', "updated_at" = now()
WHERE "status" = 'READY';
