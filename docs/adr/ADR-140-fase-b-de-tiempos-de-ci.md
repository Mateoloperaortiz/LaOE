# ADR-140: Fase B de tiempos de CI: integración en paralelo con base por worker, calidad en tres jobs y E2E adaptables partidos

- Estado: Aceptada
- Fecha: 2026-10-24
- Relacionadas: ADR-052, ADR-053, ADR-054, ADR-055, ADR-120, ADR-124, ADR-139
- Enmienda: ADR-124 (el vaciado entre pruebas pasa a ser por base de cada worker, sin tocar sus reglas de contenido) y ADR-139 (la estructura de jobs que la puerta final exige)

## Contexto

Con la Fase A (ADR-139) el CI bajó a 368–381 s por corrida. En la corrida 40114018372 los jobs más lentos fueron E2E (251–336 s por shard, ~97 s de preparación fija y ~239 s de Playwright en el peor), integración (228–302 s) y el job de calidad (300 s, de los cuales 158 s eran solo la suite unitaria en serie con lint, tipos, dependencias y build).

Tres mediciones locales fijaron el diseño:

- Quitar el aislamiento de módulos de Vitest (`--no-isolate`) en un subconjunto representativo de integración ahorra el costo de imports, pero **rompe 12 casos de 235**: el proveedor push y los registros de jobs quedan construidos por un archivo y los hereda el siguiente. Sin aislamiento no hay paralelismo seguro posible vía módulos compartidos.
- Vitest expone `VITEST_POOL_ID` como ranura estable y reutilizable por worker (1..N), distinto del identificador por archivo. Eso permite correr archivos en paralelo manteniendo el aislamiento de módulos si cada ranura tiene su propia base: el vaciado de ADR-124 deja de ser un candado global entre archivos concurrentes. El subconjunto pasó de 37,5 s en serie a 18,8 s con dos workers y 14,5 s con tres; la suite completa (221 archivos, 2.020 casos) corrió en 159 s locales con dos.
- Los dos escenarios E2E más largos (`admin-details-responsive`, 130 s; `admin-responsive`, 85 s) son bucles de 4 anchos × 2 temas dentro de un solo archivo, indivisibles para el reparto por archivo. En las unitarias, `image-decoder.test.ts` es el archivo más lento de CI (25,8 s); su caso «byte a byte» codificaba en serie 48 imágenes independientes.

## Decisión

1. **Integración corre archivos en paralelo, una base de pruebas por ranura.** `INTEGRATION_WORKERS` (1–4, dos por defecto) fija `maxWorkers` y `fileParallelism` del proyecto de integración. `tests/integration/test-database.ts` deriva de la URL base la base de cada ranura (`<nombre>_test`, `<nombre>_test_w2`, …) y valida la ranura del proceso; `setup.ts` apunta cada worker a la suya y `global-setup.ts` migra la primera y clona las demás con `CREATE DATABASE … TEMPLATE` — incluida la foto de catálogos de ADR-124 —, terminando antes las sesiones que bloquearían la copia. El aislamiento de módulos por archivo no se toca, y con `INTEGRATION_WORKERS=1` la suite vuelve exactamente al comportamiento anterior. El valor por defecto es dos y no tres: el runner de CI tiene 4 vCPU que comparte con el Postgres del shard, y las pruebas de concurrencia sensibles a tiempos corren bajo la misma presión que cualquier otro archivo.
2. **El job de calidad se divide en tres jobs paralelos:** `estatica` (Biome, tsc, dependency-cruiser, knip), `unitarias` (unit, extractor de normativa; sube `ci-unit/unit.json`) y `build` (compila e inventaría la E2E; sube `ci-inventory/inventory.json`). La puerta final (`scripts/ci/policy.mjs`) exige los seis jobs pesados — los tres nuevos, respaldo, integración y E2E — con el mismo contrato de modos (full = éxito, documentación/promoción = omitidos). El paso de build usa una clave de caché nueva que restaura también la de la clave anterior, para no pagar un primer build frío.
3. **Los bucles adaptables E2E se parten por anchos.** `admin-details-responsive` queda con 360/390 px y `admin-details-wide` toma 768/1440 px sobre la siembra compartida de `admin-details-fixture.ts`; `admin-responsive` queda con 360/390 px y `admin-responsive-wide` con 768/1440 px sobre `admin-responsive-check.ts`. Ningún caso cambia: el inventario sigue en 267 casos y los nuevos archivos entran al reparto por duración como cualquier otro (con peso mediano hasta el primer refresco de duraciones que los contenga).
4. **El caso pesado de `image-decoder` codifica en paralelo lo que ya era independiente**: las seis imágenes comunes, sus 24 comparaciones byte a byte contra la codificación de referencia y las cotas de la imagen alta van con `Promise.all` (de 7,9 s a 5,0 s locales, mismos bytes comparados).

## Consecuencias

- Cada runner de integración paga crear una o más bases clonadas por corrida (segundos contra Postgres local) y cada job nuevo de calidad repite `npm ci` (~24 s): a cambio, el camino crítico estimado baja de ~336 s (E2E) como techo duro, con integración y calidad por debajo de ~200 s si el CI replica la escala local. La medición se registra en este ADR al cerrar la fase, como en la anterior.
- Las bases `_test_wN` quedan en el Postgres local del desarrollador entre corridas, igual que ya quedaba `_test`; `global-setup` las recrea desde la plantilla en cada corrida.
- Subir `INTEGRATION_WORKERS` en CI es una variable del job, no un cambio de código: si una medición futura lo justifica, la puerta sigue siendo la suite completa repetida (los casos de concurrencia son los primeros en resentir la presión extra).
- Lo que no cambia: modos, evidencia por SHA exacto, conteos exactos, cero reintentos, `workers: 1` por shard E2E (la E2E sigue serializada contra su único servidor y su única base por runner; paralelizarla por dentro sigue fuera de alcance) y el refresco manual de duraciones de ADR-139.

## Cómo quedó

_Pendiente: se completa con la primera corrida completa en verde de esta rama (tiempo total, jobs más lentos y suma de runners, contra los 368–381 s de la Fase A)._
