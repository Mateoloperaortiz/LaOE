CREATE TABLE "point_separation_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"first_term_code" text NOT NULL,
	CONSTRAINT "point_separation_policy_singleton" CHECK ("point_separation_policy"."id" = 'GH_GAMER'),
	CONSTRAINT "point_separation_policy_term_code" CHECK ("point_separation_policy"."first_term_code" ~ '^[0-9]{4}-[12]$')
);
--> statement-breakpoint
-- Ancla propia del reloj de términos. También clasifica un semestre viejo importado después del
-- lanzamiento; no se deriva de cuándo lo crearon ni de las fechas que GH pueda editar después.
WITH launch AS (
  SELECT ((value #>> '{}')::timestamptz AT TIME ZONE 'America/Bogota')::date AS day
  FROM "app_config" WHERE "key" = 'presenceStreak.launchedAt'
)
INSERT INTO "point_separation_policy" ("id", "first_term_code")
SELECT 'GH_GAMER', coalesce(
  (SELECT code FROM "term" WHERE "starts_on" <= launch.day AND "ends_on" >= launch.day ORDER BY "starts_on" LIMIT 1),
  extract(year FROM launch.day)::int::text || '-' || CASE WHEN extract(month FROM launch.day) <= 6 THEN '1' ELSE '2' END
)
FROM launch;
--> statement-breakpoint
UPDATE "term" SET "game_points_separated" = false
WHERE "code" < (SELECT "first_term_code" FROM "point_separation_policy" WHERE "id" = 'GH_GAMER');
