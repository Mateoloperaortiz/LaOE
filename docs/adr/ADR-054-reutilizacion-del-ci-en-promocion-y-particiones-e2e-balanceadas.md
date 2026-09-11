# ADR-054: Reutilización del CI en la promoción y particiones E2E balanceadas

- Estado: Aceptada; validación remota en curso
- Fecha: 2026-09-11
- Enmienda: ADR-053 (puntos 3, 4, 9 y 10)
- Evidencia: [implementación de CI/CD](../ci-cd-2026-09-11.md)

## Contexto

Trece corridas completas del pipeline de ADR-053 dan una mediana de 10:48, con mínimo 8:24 y máximo 11:47, frente a 16:42 del pipeline anterior. El camino crítico es la partición E2E 1/2. Playwright reparte `--shard` por rangos contiguos en el orden alfabético de los archivos, así que la primera partición concentra `admin-details-responsive`, `admin-responsive`, `ajustes-ux` y `area-switching`: unos 465 s de pruebas frente a unos 320 s de la segunda. Cada job E2E tiene además cerca de 1:50 de preparación fija. Integración tarda cerca de 4:20 y sería el siguiente camino crítico.

La promoción a `production` repite el CI completo sobre un SHA que ya pasó la suite completa en `main` y ya sirvió en staging: unos 10 minutos de espera y unos 25 minutos de runner sin información nueva. ADR-053, punto 9, dejó esa reutilización como etapa posterior con condiciones explícitas: SHA exacto, workflow confiable, suite completa, resultado final y contexto compatible, con fallback a CI completo.

## Decisión

1. **Reparto por archivo con duraciones medidas.** `scripts/ci/e2e-durations.json` guarda los segundos por archivo de escenarios, generados desde un `ci-result.json` completo con `node scripts/ci/run.mjs e2e-durations <archivo>`. El reparto es voraz por duración descendente, el archivo más largo va al runner menos cargado, y determinista: el mismo árbol y el mismo JSON producen la misma partición. Un archivo sin duración conocida pesa la mediana de las conocidas y siempre queda en alguna partición. La autenticación de `auth.setup.ts` no se reparte: corre en cada runner como dependencia del proyecto `chromium`.
2. **Tres runners E2E.** La matriz declara `1/3`, `2/3` y `3/3`; `E2E_SHARDS` en `scripts/ci/e2e-partition.mjs` fija el mismo número y el comando rechaza cualquier otro total. Cada runner recibe su lista en `E2E_FILES`; la configuración de Playwright restringe `testMatch` del proyecto `chromium` a esos archivos y rechaza una lista vacía o con archivos inexistentes. Se retiran `--shard` y `--fully-parallel`. Se conservan un worker, cero reintentos y `--forbid-only`.
3. **El gate verifica el reparto.** El check `CI` recalcula la partición desde el mismo checkout y exige que cada informe contenga exactamente los archivos de su partición, además de lo que ya exigía: unión igual al inventario, sin duplicados salvo la autenticación por runner, cero saltos, reintentos y errores globales, y drenaje del outbox en cada escenario. Un desbalance nunca cambia el resultado; un reparto incompleto o repetido lo hace fallar.
4. **Modo `promotion`.** En un push a `production`, si el rango es documental se conserva el modo documental. Si no, el clasificador consulta en la API de GitHub la ejecución aprobada de este mismo workflow para el SHA exacto, con `head_branch` `main` y evento `push`, descarga su artefacto `ci-result` y exige `schema` 1, el mismo `sha`, el mismo `runId`, `mode` `full`, `result` `success` y las tres familias con casos. Solo entonces emite `promotion`, guarda el registro en `ci-results/promotion.json` y publica el artefacto `ci-promotion`. Los jobs pesados quedan omitidos explícitamente; el gate vuelve a verificar la evidencia contra `HEAD` y escribe `ci-result.json` con `mode: "promotion"` y `reused` con ejecución, URL y fecha. Un resultado de modo `documentation` o `promotion` nunca sirve de evidencia: no hay cadenas.
5. **Cualquier duda es CI completo.** Sin ejecución candidata, con el artefacto vencido a los 14 días, con una consulta fallida, con metadata incoherente o con evidencia que no cumpla una condición, el modo es `full` y el resumen explica por qué. La reutilización solo acelera; nunca decide un resultado.
6. **Permisos y rama.** El job de clasificación recibe `actions: read` además de `contents: read` para listar ejecuciones y descargar el artefacto con el token efímero del workflow; ningún otro job amplía permisos. Solo `refs/heads/production` con evento `push` puede reutilizar; `main`, los PR y las ejecuciones manuales siguen ejecutando todo.
7. **Operación.** Railway sigue esperando el check `CI` para desplegar y el smoke posterior verifica el SHA servido; la promoción sigue siendo explícita, por SHA validado en staging. Las duraciones se refrescan cuando la suite cambie de forma apreciable, con el comando del runbook; una lista vieja solo degrada el balance.

## Consecuencias

Estimación con las duraciones de la ejecución 34618190390: cada runner E2E baja de unos 9:30 a unos 6:30 y el CI completo queda alrededor de 6:45, con un runner E2E más, cerca de 2 minutos de runner adicionales por corrida. Una promoción pasa de unos 12 a unos 3 minutos hasta `SUCCESS` en Railway y ahorra unos 25 minutos de runner. Ambas cifras se acreditan en el registro de implementación, no por esta ADR.

Integración pasa a ser el siguiente camino crítico. Repartirla con `vitest --shard` y un Postgres por job queda como etapa siguiente, igual que subir a cuatro particiones E2E, que solo requiere cambiar la matriz y `E2E_SHARDS`.

La evidencia reutilizada vive lo que el artefacto: 14 días. Promover un SHA más viejo ejecuta todo. La consulta a la API añade segundos al clasificador solo en promociones. Cuando GitHub no responda, el CI completo sigue siendo el camino, sin reintentos ni esperas.
