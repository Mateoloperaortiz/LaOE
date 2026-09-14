-- Vincula los GT existentes por edición antes de exigir una sola identidad por semestre.
UPDATE "work_group" g SET "event_id" = e."event_id" FROM "event_edition" e
WHERE g."kind" = 'GT_MACROEVENT' AND g."edition_id" = e."id" AND g."event_id" IS NULL;
--> statement-breakpoint
INSERT INTO "macroevent_role" ("code", "label", "sort_order") VALUES ('RELACIONES_PUBLICAS', 'Dirección de Relaciones Públicas', 4)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
UPDATE "macroevent_role" SET "sort_order" = 5 WHERE "code" = 'MERCADEO';
--> statement-breakpoint
-- Publicidad conserva sus nombramientos y etiqueta histórica; ya no se ofrece al nombrar.
UPDATE "macroevent_role" SET "sort_order" = 90 WHERE "code" = 'PUBLICIDAD';
--> statement-breakpoint
CREATE UNIQUE INDEX "work_group_macroevent_term_unique" ON "work_group" USING btree ("term_id","event_id") WHERE "work_group"."kind" = 'GT_MACROEVENT' and "work_group"."event_id" is not null;