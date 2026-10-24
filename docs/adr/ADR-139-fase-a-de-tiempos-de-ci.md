# ADR-139: Fase A de tiempos de CI: tres runners de integración, seis E2E y duraciones medianas

- Estado: Aceptada
- Fecha: 2026-10-24
- Relacionadas: ADR-052, ADR-053, ADR-054, ADR-055, ADR-120, ADR-124
- Enmienda: ADR-055 (puntos 2 y 3: número de particiones y generación de duraciones de integración) y el reparto E2E de ADR-054

## Contexto

El assessment del 2026-10-23, sobre las últimas 15 corridas completas exitosas, midió el CI pleno en mediana de **481 s** (p90 de 996 s, unos 52 min de runner): clasifica en ~11 s, corren en paralelo integración (mediana de job 410–441 s), E2E (377–427 s), calidad (302 s) y respaldo (43 s), y el gate cierra en ~12 s. Integración ya empató a E2E como camino crítico. De cada shard de integración, Vitest atribuye ~142 s a imports sobre una base que se vacía entre pruebas (`fileParallelism: false`, una base por runner); de cada runner E2E, entre 105 y 145 s son preparación fija (contenedores, `npm ci`, build e instalar Chromium, cuyo peor caso en la muestra fue 631 s).

Las duraciones versionadas que alimentan el reparto eran de una sola corrida del 2026-09-11 (34629888480): cubrían **64 de 221** archivos de integración (el 38 % del tiempo medido ahora) y **53 de 72** escenarios E2E. Un archivo desconocido pesa la mediana, así que el reparto se degradó en silencio: en la corrida 40034608488 el shard E2E más cargado sumó 279 s de Playwright contra un óptimo voraz de ~225 s con las duraciones reales.

La alternativa estructural (quitar el aislamiento por archivo en integración, paralelizar dentro del shard E2E) toca garantías de ADR-052 y ADR-124 y queda fuera; esta fase es solo reparto, cantidad de runners y caché de navegador.

## Decisión

1. **Las duraciones son la mediana por archivo de las últimas cinco corridas completas y aprobadas de `main`.** `e2e-durations` acepta varios `ci-result.json` e `integration-durations` acepta los informes de todas las particiones de esas corridas (`--runs`/`--sha`); cada archivo usa la mediana de las muestras que tenga y el JSON conserva `sourceRunIds` con las cinco ejecuciones. Los comandos de reparto avisan en el resumen si menos del 90 % de los archivos actuales tiene duración conocida. La primera aplicación usa las ejecuciones 40034608488, 40032673651, 39870634123, 38966930203 y 38768829601, y cubre 221/221 archivos de integración y 72/72 escenarios.
2. **Integración corre en tres runners y E2E en seis.** `INTEGRATION_SHARDS = 3`, `E2E_SHARDS = 6` y las matrices declaran `1/3`–`3/3` y `1/6`–`6/6`; el comando sigue rechazando cualquier otro total y el gate sigue exigiendo exactamente un informe por partición y la unión completa. Con las duraciones medianas nuevas, el reparto E2E queda en ~190 s de Playwright por runner y el de integración en ~143 s de spans por runner (más su costo de imports, que también se reparte por archivo).
3. **Chromium se cachea entre corridas.** Cada job E2E restaura `~/.cache/ms-playwright` con clave por sistema y `package-lock.json` antes de `playwright install --with-deps chromium`, que se sigue ejecutando: verifica el navegador y deja las dependencias del sistema. La caché solo evita volver a descargar el navegador; un acierto parcial descarga lo que falte.
4. **Lo demás no cambia.** Mismos modos (full/documentación/promoción), misma evidencia reutilizable por SHA exacto, mismo conteo exacto de casos y archivos, cero reintentos y `workers: 1` por partición E2E.

## Consecuencias

- El modelo con las duraciones de la corrida 40034608488 estima el job más lento en ~303 s (integración) y ~304 s (E2E antes de la caché), con el CI completo alrededor de **5:30–6:00** contra la mediana medida de 8:01, a cambio de ~3 min de runner más por corrida por la preparación fija de los dos runners nuevos.
- Refrescar duraciones sigue siendo manual: descargar los artefactos `ci-result` y `ci-integration-*` de las últimas cinco corridas plenas de `main` y correr los dos comandos generadores. El aviso de cobertura hace visible cuándo vuelve a degradarse; no bloquea.
- Seis runners E2E comparten la misma clave de caché de navegador: el primero que la guarda gana y los demás la encuentran ya reservada; ninguno depende de guardarla para pasar.

## Cómo quedó (2026-10-24)

La primera corrida con la matriz nueva (ejecución 40113429214, aprobada) tardó **381 s**, contra la mediana de 481 s de la muestra base (-100 s, -21 %), con los jobs más lentos en E2E 3/6 (352 s), E2E 4/6 (346 s) e integración 1/3 (323 s). La suma de runners fue 50,8 min, apenas por debajo de la mediana base de 51,9 min. Esa corrida todavía no acredita la caché de Chromium: los seis runners la buscaron sin encontrarla y uno solo la guardó al final, así que su efecto se mide desde la siguiente. La estimación de ~5:30–6:00 queda como meta a confirmar con la mediana de las próximas corridas, no con una sola.
