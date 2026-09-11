# ADR-055: Cuatro particiones E2E, integración en dos runners y lista documental ampliada

- Estado: Aceptada; validación remota en curso
- Fecha: 2026-09-11
- Enmienda: ADR-053 (puntos 1, 2 y 7) y ADR-054 (punto 2)
- Evidencia: [implementación de CI/CD](../ci-cd-2026-09-11.md)

## Contexto

Con tres particiones balanceadas, el CI completo midió 6:50, 6:55 y 7:04. El camino crítico sigue siendo E2E: cada runner tarda entre 5:43 y 6:35, de los cuales cerca de 2:10 son preparación fija y el resto son entre 237 y 293 s de pruebas. Integración tarda entre 4:15 y 4:19 y solo pasaría a ser el camino crítico si E2E bajara de ese valor; la lectura de ADR-054 que la daba ya por crítica era imprecisa. Dentro de integración, 65 archivos suman unos 130 s de pruebas y otros 80 s de importaciones y preparación, en serie por diseño (`fileParallelism: false`, una sola base `_test`).

El PR 8, que solo cambiaba documentación, ejecutó la suite completa y desplegó staging porque `docs/04-decisiones.md` no está en la lista documental. Ese archivo y `docs/10-verificacion.md` son índice y guía de verificación: ningún script ni módulo los consume.

## Decisión

1. **Lista documental.** `scripts/ci/documentation-paths.json` incorpora `docs/04-decisiones.md` y `docs/10-verificacion.md`. La misma lista alimenta los watch patterns de `web`; el cambio se aplica a staging y producción con `update-service` sobre `watchPatterns` únicamente, sin cambios escalonados ni redeploy, y se verifica releyendo la configuración. Los demás docs siguen exigiendo la suite completa; `docs/14-copy-y-textos.md` sigue fuera porque alimenta el copy generado.
2. **Cuatro runners E2E.** `E2E_SHARDS` pasa a 4 y la matriz declara `1/4` a `4/4`. El reparto por archivo, el gate y la autenticación por runner de ADR-054 no cambian. Las duraciones se refrescan desde la ejecución 34629888480, la primera de `main` con tres particiones.
3. **Integración en dos runners con reparto por archivo.** `scripts/ci/integration-partition.mjs` lista `tests/integration/**/*.test.ts`, lee `scripts/ci/integration-durations.json` y reparte con el mismo algoritmo voraz de ADR-054. `node scripts/ci/run.mjs integration-shard k/2` imprime los archivos de la partición y cada job los pasa a Vitest como filtros de archivo; `INTEGRATION_SHARDS` fija el total y el comando rechaza otro. Cada runner conserva su PostgreSQL 18 y su Garage, y su `globalSetup` crea y migra su propia base `_test`. Las duraciones se generan con `node scripts/ci/run.mjs integration-durations <integration.json> [run] [sha]` desde el informe JSON de una corrida aprobada.
4. **El gate verifica integración por partición.** Cada informe debe estar aprobado completo, como antes, y contener exactamente los archivos de su partición; la unión debe ser el inventario del checkout, sin repetidos. `ci-result.json` conserva casos y archivos totales y por partición. Un desbalance nunca cambia el resultado; un archivo que no corra en ninguna partición hace fallar el check.
5. **Cualquier otro modo sigue igual.** Documentación y promoción no ejecutan ni verifican integración ni E2E; la evidencia reutilizable sigue exigiendo `mode: full`.

## Consecuencias

Estimación con las duraciones medidas: cada runner E2E baja a unos 5:30 y cada runner de integración a unos 2:40, con el CI completo alrededor de 5:45 a 6:00; unos 3 minutos de runner más por corrida. La medición real se registra en el registro de implementación. A partir de aquí la preparación fija de cada runner domina: subir a cinco particiones E2E solo requiere cambiar la matriz y `E2E_SHARDS`, con retornos decrecientes.

Un push que solo toque los dos archivos nuevos de la lista valida en modo documental y no despliega. Si las duraciones versionadas quedan viejas, el reparto se degrada pero no el resultado; refrescarlas es un comando.
