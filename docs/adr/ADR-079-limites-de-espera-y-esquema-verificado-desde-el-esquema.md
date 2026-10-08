# ADR-079: Ninguna espera es indefinida, y lo que se verifica sale de su fuente

- Estado: Aceptada (enmendada por ADR-118)
- Fecha: 2026-09-19
- Relacionadas: ADR-012, ADR-021, ADR-032, ADR-039
- Enmienda: ADR-012 (ejecución del poller), ADR-032 (`db:release`)

## Contexto

La [auditoría de código del 2026-09-19](../auditoria-codigo-2026-09-19.md) no encontró código descuidado, pero sí cuatro cosas que no se notan hasta que fallan. Las cuatro se comprobaron leyendo el código en `7edf50e`.

**La base no tenía ningún límite de espera.** `src/db/client.ts` creaba el pool con `connectionString` y `max: 10`, nada más: pedir una conexión, una sentencia y una transacción abierta podían esperar para siempre. Tampoco registraba un listener de `error`, y `pg` documenta que el error de un cliente inactivo sin listener (un reinicio de Postgres, un corte de red) termina el proceso.

**El poller podía quedarse detenido.** `processOne` toma la fila del outbox con `FOR UPDATE SKIP LOCKED` y, con esa transacción abierta, corre los handlers en serie. De los adaptadores que esos handlers llaman, solo Google Wallet tenía límite de red: Resend, el bucket y el push web no. Un proveedor que acepta la conexión y no responde detenía toda la cola —el push de un check-in detrás del lote de una campaña— hasta el siguiente despliegue. Los comentarios de `poller.ts` y `registry.ts` decían además que el handler corre «dentro de la misma transacción», y no es así: los handlers usan `getDb()` y `runCommand`, que son otras conexiones; la transacción del poller solo sostiene el bloqueo de la fila.

**La lista de índices exigidos ya se había desfasado.** `REQUIRED_INDEXES` en `scripts/lib/release.ts` era una lista escrita a mano de 119 nombres que cada migración debía acordarse de ampliar. Le faltaban cuatro únicos declarados en el esquema: `term_code_unique`, `committee_slug_unique`, `committee_membership_person_committee_term_unique` y `challenge_evidence_ordinal_unique`. Su comentario decía «índices parciales», pero incluía únicos simples y un GIN. El dominio traduce las violaciones por el nombre del índice (`src/db/errors.ts`), así que la lista no es decorativa. Era además uno de los archivos que más cambian del repo (21 commits), es decir, un punto de conflicto entre sesiones en paralelo.

**Nada vigilaba que el catálogo de textos generado siguiera a su documento.** `copy:sync` genera `textos.generated.ts` desde `docs/14-copy-y-textos.md`; editar el documento y olvidar el comando dejaba al código con el texto viejo sin que nada fallara. El diccionario del Wordle sí tiene su `wordle:check`.

Tres hallazgos menores del mismo corte entran aquí porque no cambian comportamiento: la regla de «correo institucional» estaba escrita tres veces con dos semánticas (la de `identity`, de dominio exacto, solo la usaba su prueba); seis sitios lanzaban consultas en paralelo con `Promise.all` sobre una misma transacción, que es una sola conexión —no paraleliza nada y `pg` 8 ya lo avisa como obsoleto, con retiro en `pg@9`; la suite de integración emitía ese aviso 14 veces—; y no había una medición repetible de la deuda.

## Decisión

1. **El pool tiene límites**, configurables por entorno y con `0` como «sin límite»:
   - `DB_CONNECTION_TIMEOUT_MS` (10 s): pedir una conexión al pool.
   - `DB_STATEMENT_TIMEOUT_MS` (60 s): una sentencia, incluida la espera de un `pg_advisory_xact_lock`.
   - `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (15 min): una transacción abierta sin actividad.

   Son valores de resguardo, no de ajuste fino: están muy por encima de lo que tarda hoy cualquier operación, y existen para que «nunca» deje de ser un resultado posible.
2. **El pool registra `error`** y lo manda al log; un cliente inactivo que falla ya no termina el proceso.
3. **Las migraciones no llevan límite por sentencia.** `db:release` y `db:reset` fijan `DB_STATEMENT_TIMEOUT_MS=0` si el entorno no lo define: un `CREATE INDEX` o un backfill legítimo puede tardar más que una consulta de la app.
4. **Cada adaptador de red tiene su límite**: Resend 30 s por llamada (`withTimeout`, porque su SDK no ofrece cancelación), el cliente S3 y el de SES 5 s para conectar y 30 s por tramo sin datos, el push web 10 s. Para `comms` un envío que vence es un envío fallido, igual que cualquier otro error del proveedor: `send.ts` ya lo convierte en un recibo `FAILED`.
5. **El poller tiene un último recurso**, `JOBS_HANDLER_TIMEOUT_MS` (10 min), que cubre todos los handlers de un evento. Al vencer, el intento se registra como fallido con su backoff y la cola sigue; la cadena abandonada no arranca los handlers que le faltaban. La promesa abandonada no se puede cancelar: termina sola, acotada por las reglas 1 y 4. Por eso el valor es holgado —un lote de 200 correos con esperas de ráfaga puede tardar minutos— y solo debería verse cuando algo se escapó de los otros límites.
6. **La base espera más que el poller.** Mientras corren los handlers, la conexión del poller está «idle in transaction». Si la base cortara primero, la actualización del intento fallaría, la fila quedaría libre sin contar el intento y se reintentaría de inmediato y sin backoff. `src/env.ts` rechaza al arrancar una configuración con `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` menor o igual que `JOBS_HANDLER_TIMEOUT_MS`, salvo que alguno sea `0`.
7. **Los índices exigidos salen del esquema.** `db:release` recorre `src/modules/*/schema.ts` —los mismos archivos que `drizzle.config.ts`— y exige todo índice único y todo índice GIN que declaren. Los tres GIN de `pg_trgm` viven en una migración custom, fuera del esquema, y son la única lista a mano (`CUSTOM_INDEXES`). Un índice exigido sin nombre es un error. Una migración nueva ya no toca `release.ts`.
8. **El catálogo de textos se vigila con una prueba unitaria**, no con un comando aparte: `tests/unit/copy-sync.test.ts` lee `docs/14` con el mismo parser que `copy:sync` (`scripts/lib/copy.ts`) y lo compara con el generado. Compara contenido, no formato, así que no depende de Biome. Corre en `npm test`, en `npm run check` y en CI sin tocar el pipeline.
9. **Una sola regla de correo institucional**, `hasInstitutionalDomain` en `people/domain/person-pure.ts`: dominio exacto o subdominio. `people.isInstitutionalEmail` y el roster la usan; la versión de `identity` se borra.
10. **Las consultas sobre una transacción van en serie.** `Promise.all` queda para lecturas sobre el pool. Vale también para una función que recibe un `Executor`: puede llegarle una transacción (`people.leadershipContext` era el sexto caso, y el único que no se veía leyendo al que llama). La señal es el aviso de `pg` en la suite de integración, que quedó en cero.
11. **La deuda se mide con `npm run audit:metrics`** (`scripts/audit-metrics.ts`, solo lectura). Imprime la tabla que cada tramo de la auditoría debe mover; la fila nueva se anota en el documento de la auditoría al cerrar el tramo.

## Consecuencias

- Una sentencia que supere 60 s, o que espere más de 60 s un advisory lock, falla con error de Postgres en vez de esperar. En una petición web eso ya era un timeout del proxy; en un job es un intento fallido con backoff. Si una operación legítima lo necesita, se sube la variable en ese entorno, no se quita el límite.
- Un handler abandonado por la regla 5 puede coincidir con su propio reintento. Los handlers ya son idempotentes (ADR-012) y los que recalculan toman advisory locks, y el backoff mínimo es de un minuto. Sigue siendo el motivo para que el valor sea holgado.
- La regla 5 no resuelve el fondo: el poller sigue siendo serial y sigue sosteniendo una transacción mientras trabaja. Reservar la fila con `lockedUntil` y llevar una fila por par evento-handler queda para el tramo R4 de la auditoría, con su propia ADR.
- Un envío de correo que vence a los 30 s es ambiguo: pudo haber salido. Hoy ya lo era cualquier error de red hacia Resend. La clave de idempotencia de Resend queda anotada para R4.
- `db:release` exige 123 índices en lugar de 119. Los cuatro nuevos ya existen en toda base migrada, porque los crean migraciones aplicadas; lo confirma la suite de integración, que migra y verifica una base desde cero.
- `scripts/lib/release.ts` importa el esquema de los módulos. Es lo mismo que hace `drizzle.config.ts` y no cruza ninguna regla de `dependency-cruiser`, que acota `src/`.
- Pruebas: unitarias de `withTimeout`, del límite de Resend, de las variables nuevas y su invariante, de los índices derivados y del catálogo de textos; integración del poller con un handler que no vuelve.
- No cambia ninguna migración, ningún texto ni ninguna pantalla.

## Pendiente de este tramo

- **La IP del cliente** (`clientIp()` toma el primer valor de `X-Forwarded-For`) espera a comprobar en el despliegue real qué cabeceras entregan Cloudflare y Railway (tramo V1).
- **El prefijo `__Host-` de la cookie de sesión** cierra las sesiones vivas y va con la ADR de sesión y subdominios (tramo R8).

## Enmienda (2026-10-08, ADR-118)

La regla 6 decía que, si la base cortaba la conexión del poller mientras corrían los handlers, «la fila quedaría libre sin contar el intento y se reintentaría de inmediato y sin backoff», y lo evitaba exigiendo que la base esperara más que el poller. Eso cerraba una causa; la muerte del proceso con el evento tomado dejaba la fila igual (DT-212). [ADR-118](ADR-118-reglas-de-correccion-del-sexto-ciclo.md) regla 1 lo cierra para todas: el poller cuenta el intento y corre `nextAttemptAt` en una toma que confirma antes de correr los handlers. La invariante de `src/env.ts` sigue igual; lo que protege ahora es que un intento sano no se pierda por un corte de la base, no que la fila se reintente sin espera.
