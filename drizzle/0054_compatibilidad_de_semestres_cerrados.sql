ALTER TABLE "term" ADD COLUMN "game_points_separated" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- Frontera fijada una sola vez a partir del lanzamiento guardado por 0053. No depende de la
-- fecha de una lectura futura ni cambia cuando GH edita después las fechas de un semestre.
WITH launch AS (
  SELECT ((value #>> '{}')::timestamptz AT TIME ZONE 'America/Bogota')::date AS day
  FROM "app_config" WHERE "key" = 'presenceStreak.launchedAt'
)
UPDATE "term" SET "game_points_separated" = false
FROM launch
WHERE "term"."ends_on" < launch.day
  OR ("term"."points_closed_at" IS NOT NULL
      AND NOT ("term"."starts_on" <= launch.day AND "term"."ends_on" >= launch.day));
