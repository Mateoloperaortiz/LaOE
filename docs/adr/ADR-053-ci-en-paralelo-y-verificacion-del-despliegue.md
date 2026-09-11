# ADR-053: CI en paralelo y verificación del despliegue

- Estado: Aceptada; validación remota en curso
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
