# ADR-053: CI en paralelo y verificación del despliegue

- Estado: Aceptada (enmendada por ADR-054 y ADR-055)
- Fecha: 2026-09-11
- Enmienda: ADR-023, ADR-039 y ADR-052
- Evidencia inicial: [assessment de CI/CD](../assessment-ci-cd-2026-09-11.md)

## Contexto

CI tenía una mediana reciente de 16:42. Integración, build, Chromium y E2E corrían consecutivamente en un job; también se ejecutaban y desplegaban cambios puramente documentales. El usuario autorizó implementar la propuesta y medirla en GitHub. El aislamiento y el drenaje estricto de ADR-052 son requisitos previos para repartir la suite.

## Decisión

1. Un clasificador compara todo el rango del push, o la base del PR con el merge realmente comprobado. Solo las rutas enumeradas en `scripts/ci/documentation-paths.json` admiten validación documental. Un diff vacío, incompleto, una referencia nueva, un evento manual o un archivo desconocido ejecuta toda la suite. El workflow siempre emite un resultado final; no se omite mediante filtros de paths del trigger.
2. Calidad, respaldo, integración y dos particiones E2E corren en paralelo después del clasificador. Cada job que necesita datos tiene su propio PostgreSQL 18 y Garage. Integración crea y migra su base `_test`; cada launcher E2E prepara la base desechable de ADR-052. No hay seed previo compartido entre jobs.
3. Playwright distribuye los casos con `--fully-parallel --shard=N/2`, pero cada máquina conserva un solo worker. La autenticación se repite en cada partición. Se mantienen cero reintentos y se prohíbe `test.only` en CI.
4. La fixture anota `outbox: sin fallos` únicamente después del drenaje estricto final. El check estable **CI** exige que todos los jobs necesarios terminen aprobados, que los informes de Vitest contengan todos sus casos aprobados y que los dos informes E2E cubran exactamente el inventario descubierto, sin omisiones ni duplicados salvo la autenticación por partición. Un informe ausente, salto, reintento, error global, escenario sin drenaje o job cancelado hace fallar ese check. El modo documental exige que los jobs pesados estén explícitamente omitidos.
5. Se conservan los builds de calidad y E2E, con caché `.next/cache` separada por propósito, plataforma, Node, lockfile, configuración y fuentes. Se conserva la caché npm existente. No se comparte un build completo entre entornos. Los builds CI usan modo producción sin OTP fijo; el servidor de pruebas recibe el entorno sintético del launcher.
6. Los informes de casos y el resultado final, con SHA y run ID, se guardan durante 14 días y se resumen en Actions. Las trazas E2E de fallos se guardan siete días. El inventario completo se genera con `--list`, sin crear base ni arrancar servidor.
7. Web conserva `checkSuites: true`, migraciones y healthcheck. Sus watch patterns incluyen todo y excluyen exclusivamente la misma lista documental del clasificador. La aplicación de esos filtros modifica únicamente `watchPatterns` del servicio y entorno explícitos; no requiere aplicar un plan de infraestructura que incluya bases, archivos PITR o secretos. El código IaC conserva la configuración como fuente versionada.
8. Un workflow separado recibe los estados exitosos de Railway y ejecuta el smoke HTTP existente. Verifica emisor, nombre e ID del entorno y SHA completo. Las expectativas de URL, bucket e indexación se fijan en `smoke-environments.json`, verificadas con la metadata de Railway, sin credenciales. También admite comprobar manualmente un deployment de GitHub mediante su ID. Usa la versión de herramientas del workflow y comprueba el SHA del deployment, incluso si son distintos. No abre sesiones ni modifica datos.
9. El smoke ocurre después del deployment y no se incluye entre los requisitos previos que Railway espera. La promoción de producción sigue siendo explícita, por SHA validado. La reutilización de un CI anterior al promover se mantiene como una optimización posterior: esta entrega conserva la validación completa en producción cuando cambie código.
10. El resultado estable **CI** se configura como comprobación requerida de las ramas una vez observado su funcionamiento. La validación documental no equivale a una certificación completa reutilizable para otro cambio. La medición diferencia la referencia con la suite corregida, el CI optimizado y el recorrido documental; no se presenta una estimación como resultado alcanzado.

## Consecuencias

La espera puede bajar a costa de repetir preparación y builds en dos runners E2E. La comparación debe registrar tiempo total, partición más lenta, cola, caché y minutos de runner; la mediana histórica de la suite anterior sirve de contexto, no de prueba causal.

La verificación del inventario protege frente a particiones vacías o casos omitidos por selección. Las bases siguen siendo secuenciales dentro de cada máquina. La lista documental es deliberadamente limitada: copy, migraciones, código, pruebas, dependencias y configuración nueva ejecutan la suite completa y siguen pudiendo desplegar web.

Las ramas, el despliegue, el smoke y los cambios efectivos en Railway se acreditan por ejecución en el registro de implementación. Escribir esta ADR no los da por realizados.

## Incidencia durante la activación

El merge inicial activó un job de seguridad de Dependabot para `joi`. El actualizador terminó en `security_update_not_possible`: `passkit-generator@3.5.8` fija `joi@17.13.4`, y su solución automática proponía bajar PassKit a 3.1.2. Railway, con Wait for CI, descartó el deployment `88f497a3-223d-49c1-9837-c478e64ad269` al fallar ese check. La [ejecución fallida](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34610240409) conserva el diagnóstico.

Se corrige la dependencia con un override limitado a `passkit-generator → joi@^17.13.8`, resuelto en el lockfile a 17.13.8. Se conserva PassKit 3.5.8; sus pruebas existentes firman un pase sintético y verifican bytes, manifiesto y CMS con OpenSSL. `npm ci`, la auditoría de la dependencia y `npm run check` deben comprobar la resolución y la compatibilidad antes de publicar. El [changelog de Joi](https://joi.dev/resources/changelog) registra los parches de la misma serie 17.13. El override podrá retirarse cuando la dependencia upstream acepte esas correcciones. Se conservan Dependabot y la espera de CI de Railway.

## Cierre del proceso de preparación

La medición controlada [34613619871](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34613619871) quedó detenida en `storage:init`: su log confirmó el bucket y CORS a las 15:02:10 UTC, pero el proceso seguía abierto al cancelarlo a las 15:15:32. No fue un timeout de las pruebas ni una operación S3 pendiente según esos mensajes. El check final falló al faltar la partición; esta ejecución no acredita una suite completa aprobada.

El logger estaba creando el transporte de `pino-pretty` con worker también en CI. Se limita ese transporte a una terminal local interactiva, siguiendo la [integración recomendada por Pino](https://github.com/pinojs/pino-pretty#programmatic-integration); CI, producción y salidas redirigidas emiten JSON. Las pruebas lanzan procesos reales y comprueban salida, redacción y cierre sin `process.exit`. El log remoto permite localizar la espera en el cierre del proceso, pero no identificar con certeza cuál de sus recursos lo retenía.

Además, ambos pasos `storage:init` tienen un límite independiente de un minuto y muestran el log de Garage si la preparación falla. El límite impide consumir los 15–20 minutos permitidos al job entero; un bloqueo sigue siendo un fallo de CI, sin reintentos de las pruebas ni éxito simulado.

## Propagación del resultado y eventos tardíos

La revisión del artefacto de [34619339626](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34619339626) encontró un falso verde: salud rechazó el SHA antiguo `f989420` porque producción ya servía `d1c4b12`, pero `tee` ocultó el código de salida. Ambos workflows declaran ahora `shell: bash`, que GitHub ejecuta con `-eo pipefail`; esto protege tanto el smoke como el harness de respaldo. La [referencia de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) distingue ese comportamiento del shell predeterminado sin `pipefail`.

Railway había emitido un nuevo estado exitoso para el deployment retirado después de aprobar el actual. Los eventos automáticos comprueban si existe un deployment posterior del mismo entorno y emisor que haya sido aprobado; en ese caso omiten la comprobación HTTP y lo explican en el resumen, sin certificar el SHA antiguo. Un deployment posterior pendiente o fallido no la suprime. La falta de metadata provoca un fallo, nunca una aprobación.

La consulta manual conserva siempre el SHA solicitado y exige un estado exitoso histórico. Puede comprobar un deployment marcado después como inactivo: la verificación HTTP decide si ese SHA está realmente servido. Las pruebas cubren eventos tardíos, emisores y entornos ajenos, errores de consulta y estados pendientes/fallidos. La validación remota incluye un control negativo con el SHA retirado y otro positivo con el SHA vigente. Los workflows de commits anteriores conservan su versión histórica; sus estados verdes no sustituyen la inspección del artefacto.

## Enmienda (2026-09-11, ADR-054)

[ADR-054](ADR-054-reutilizacion-del-ci-en-promocion-y-particiones-e2e-balanceadas.md) cambia cuatro puntos. El punto 3 deja de usar `--shard` y `--fully-parallel`: cada runner recibe una partición por archivo calculada desde duraciones medidas, y son tres runners en vez de dos. El punto 4 añade al gate la comprobación de que cada informe contiene exactamente los archivos de su partición. El punto 9 se activa: un push a `production` cuyo SHA tiene un CI completo aprobado en `main` reutiliza esa evidencia con el modo `promotion`, con fallback a la suite completa ante cualquier duda. El punto 10 admite ese tercer modo del check estable `CI`; la validación documental sigue sin servir de evidencia. El resto de esta ADR conserva su texto.

## Enmienda (2026-09-11, ADR-055)

[ADR-055](ADR-055-cuatro-particiones-e2e-integracion-en-dos-runners-y-lista-documental.md) amplía la lista documental del punto 1 con `docs/04-decisiones.md` y `docs/10-verificacion.md`, reparte integración en dos runners con base propia cada uno (punto 2) y aplica la misma lista a los watch patterns de `web` (punto 7). El resto conserva su texto.
