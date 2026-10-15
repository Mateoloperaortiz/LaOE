-- La preparación contable no enciende la bandera vigente ni devenga bonos. Si la gamificación
-- ya estaba habilitada al promover, el lanzamiento sucede en este mismo release; en otro caso
-- lo fija una sola vez el comando de activación de participation.
INSERT INTO "app_config" ("key", "value")
SELECT 'gamification.launch', jsonb_build_object('at', CASE
  WHEN EXISTS (SELECT 1 FROM "app_config" WHERE "key" = 'gamification.enabled' AND "value" = 'true'::jsonb)
  THEN coalesce(
    (SELECT "value" #>> '{}' FROM "app_config" WHERE "key" = 'presenceStreak.launchedAt'),
    to_char(current_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  ELSE NULL
END)
ON CONFLICT ("key") DO NOTHING;
