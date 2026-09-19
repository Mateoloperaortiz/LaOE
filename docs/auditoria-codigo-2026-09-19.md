# Auditoría de código y preparación de plataforma — casa-digital

Fecha: 2026-09-19 · Commit auditado: `7edf50e` (`main`) · Solo lectura: no se editó el repo, no se corrió build, pruebas ni nada contra la base o Railway.

## 1. Veredicto

El código está **más sano de lo normal para su velocidad**: ~110 mil líneas propias escritas en 17 días (2026-09-02 a 09-19, 335 commits) con cero `any`, cero `@ts-ignore`, cero TODO, knip y dependency-cruiser en verde, `tsconfig` estricto de verdad y 0,43 líneas de prueba por línea de código. No se encontró ninguna falla de autorización en 161 server actions, 95 páginas protegidas y 20 route handlers.

La deuda no es «código sucio». Es de cuatro tipos:

1. **Robustez operativa** que no se nota hasta que falla (pool de Postgres sin timeouts, poller serial con la transacción abierta, IP del cliente tomada de una cabecera falsificable, lista manual de índices ya desfasada).
2. **Registros centrales** que toca cada función nueva y que son imanes de conflicto entre sesiones en paralelo (`people/index.ts` 37 commits, `global-setup.ts` 32, `admin/layout.tsx` 31, `participation/index.ts` 25, `_kit/registry.ts` 24, `release.ts` 21).
3. **Presentación sin piezas base**: `src/shared/ui` casi vacío, helpers de actions copiados en 50 archivos, páginas de 600 a 900 líneas, textos leídos por posición.
4. **Restos y crecimiento sin límite**: 2.024 líneas muertas de la migración GHPOINTS, documentos de 150 a 330 KB que toda sesión debe leer, y documentación de arquitectura que describe una estructura que no existe.

No hay PR abiertos ni worktrees: **es buen momento para mover carpetas**.

Para las apps hermanas, el hecho decisivo es que **Inventiva, En Femenino y Días EAFIT ya están modelados** en el módulo `events` (con páginas públicas, inscripción y check-in por edición) y que el tope de US$20/mes no aguanta un servicio web por app. La recomendación está en la sección 6.

## 2. Método y nivel de confianza

Seis frentes en paralelo (dominio, `src/app`, compartidos, pruebas/scripts/CI, barrido cuantitativo, multi-app) más un análisis de churn en git. Volví a comprobar a mano contra el código los hallazgos que sostienen las decisiones: eventos sin tipar (`src/db/tx.ts:29-34`), `DomainError` en el admin-kit (73 archivos de `src/modules` lo importan), ausencia de `events.ts` y de `actions.ts` en los módulos, `lockTerm` copiado 4 veces, 25 componentes cliente que importan el catálogo de textos, 13 copias de `requireAdmin`, los 4 índices que faltan en `REQUIRED_INDEXES`, el pool sin configurar, `clientIp()`, las tres versiones de «correo institucional», `Promise.all` sobre una transacción y el flujo del poller.

Lo que sigue siendo **hipótesis** está marcado con (H) y reunido en la sección 9.

## 3. Lo que está bien y no hay que tocar

- `runCommand`: mutación, auditoría y outbox en una sola transacción; lecturas cruzadas resueltas en los wrappers `*As` antes de abrirla.
- Fronteras entre módulos por `index.ts`, sin `export *`, vigiladas por 8 reglas claras de dependency-cruiser sin excepciones acumuladas. `src/shared` no importa `modules` ni `app`.
- Los 42 archivos `*-pure.ts` con sus pruebas unitarias; `tests/unit` separado del código ayuda.
- Invariantes en la base (CHECK, únicos parciales), idempotencia por `requestId` y `dedupeKey`.
- Motores de los juegos en la raíz del módulo (los comparten navegador y servidor).
- `src/env.ts` (Zod al arrancar, PEM verificados, `OTP_FIXED_CODE` prohibido en producción), el adaptador de correo, `src/db/errors.ts`.
- `tokens.css` por capas (marca, semánticos por tema, base, `boton-*` con 439 usos consistentes): ya funciona casi como paquete de tema.
- Proxy mínimo con CSP por nonce; fachada de iconos; CSV con fórmulas neutralizadas.
- React alineado con el compilador: 1 `useMemo`, 0 `useCallback`, solo 16 componentes cliente en `src/app`.
- Pruebas sin `skip`, `only`, `fixme` ni `waitForTimeout`; bases desechables con guardas; E2E con localizadores accesibles (1.750 `getBy*` contra 119 `locator`).
- El clasificador de CI, el gate con evidencia y el smoke que valida el SHA.
- Módulos chicos sanos: `terms`, `events`, `finance`, `wallet`, `forms`.

## 4. Hallazgos por prioridad

Esfuerzo: S (horas), M (1 a 3 días), L (una semana o más).

### A. Robustez y seguridad — arreglar antes que cualquier refactor

| # | Hallazgo | Evidencia | Arreglo | Esf. |
|---|---|---|---|---|
| A1 | Pool de Postgres sin listener de `error`, sin `statement_timeout`, `idle_in_transaction_session_timeout` ni `connectionTimeoutMillis`. Según la doc de `pg`, un error en un cliente inactivo sin listener tumba el proceso (H: no reproducido). | `src/db/client.ts:9` | Configurar el pool y registrar `pool.on("error")`. | S |
| A2 | El poller ejecuta los handlers en serie **con la transacción del outbox abierta** y sin timeout por handler; solo Google Wallet tiene timeout de red. Un Resend, S3 o push colgado frena toda la cola y retiene conexiones (cada job ocupa al menos 2 de 10). Un lote de campaña retrasa el push de un check-in. Si falla el tercer handler de un evento, los dos primeros se repiten. Los comentarios «misma transacción» son engañosos. | `src/jobs/poller.ts:14-45`, `src/shared/adapters/mail.ts`, `storage.ts`, `pusher.ts` | Paso 1 (S): timeouts en cada SDK y `Promise.race` por handler. Paso 2 (M): reservar la fila con `lockedUntil` en vez de sostener la transacción, y una fila por par evento-handler. | S + M |
| A3 | `clientIp()` toma el primer valor de `X-Forwarded-For`, que detrás de Cloudflare lo controla el cliente; `cf-connecting-ip` no se lee en ningún lado. De esa IP dependen los límites por IP del OTP y del login, y la auditoría. (H: no se probó si el edge de Railway reescribe la cabecera; comprobarlo en staging antes de cambiar.) | `src/shared/lib/request.ts:5-14` | Leer `cf-connecting-ip` cuando exista. | S |
| A4 | `REQUIRED_INDEXES` es una lista manual **ya desfasada**: faltan `term_code_unique`, `committee_slug_unique`, `committee_membership_person_committee_term_unique` y `challenge_evidence_ordinal_unique`. El comentario dice «parciales» pero incluye no parciales. El dominio depende de esos nombres vía `isUniqueViolation`. Mismo problema en `truncateAll` (lista manual de tablas). | `scripts/lib/release.ts:6-141`, `tests/integration/db.ts:27-45` | Derivar la lista del último snapshot de Drizzle, o una prueba unitaria que compare esquema y lista. `truncateAll` con `pg_tables`, como ya hace `tests/e2e/database.ts:27`. | S |
| A5 | La cookie `oe_sesion` no lleva prefijo `__Host-` y sus atributos están escritos dos veces. En cuanto exista otra app en `*.oeeafit.com`, esa app podría imponer una `oe_sesion` con `Domain=.oeeafit.com` (H: fijación de sesión, no probada). | `src/modules/identity/actions.ts:90-101`, `src/app/activar/[token]/actions.ts:47-55` | Un único `setSessionCookie` y renombrar a `__Host-oe_sesion`. Cierra las sesiones vivas: hacerlo en una ventana tranquila. Va con la ADR de la sección 6. | S |
| A6 | Tres implementaciones de «correo institucional» con dos semánticas: la de `identity` exige dominio exacto (y solo la usa su prueba); las dos de `people` aceptan subdominios. | `identity/domain/pure.ts:26`, `people/domain/admission.ts:25`, `people/domain/roster-pure.ts:358` | Una sola en `shared/lib`, borrar la de `identity`. | S |
| A7 | `Promise.all` sobre un único cliente de transacción: no paraleliza y `pg` 8.23 ya lo marca como deprecado con retiro en `pg@9`. | `participation/domain/checkin-boost.ts:89`, `gamification-commands.ts:125,173`, `boosters.ts:583`, `finance/domain/movements.ts:95` | `await` en serie. | S |
| A8 | **Datos personales reales junto al repo**: `LaOE/outputs/` tiene 162 archivos (CSV de personas, xlsx, zip) sin git ni cifrado. Si `LaOE/` pasa a ser raíz de un monorepo, un `git add .` los publica. | `/Users/mateo/Documents/GitHub/LaOE/outputs/` | Sacarlos de `GitHub/` a una ubicación cifrada; como mínimo un `.gitignore` de raíz antes de reorganizar. | S |
| A9 | El scheduler no recupera programados perdidos: si un despliegue cae a las 06:00, `permanence.daily` no corre ese día. `/api/health` no informa cola pendiente, dead letters ni si el poller vive. No hay tracker de errores. | `src/jobs/scheduler.ts:32-43` | Recuperación al arrancar; salud del outbox en `/api/health` (que además hoy expone commit y versión de Postgres en público). | M |

### B. Estructura que frena el crecimiento

| # | Hallazgo | Evidencia | Arreglo | Esf. |
|---|---|---|---|---|
| B1 | **El catálogo completo de textos viaja al navegador.** `textos.generated.ts` es un solo objeto de 357 KB con campos editoriales (`where`, `owner`, `status`); 25 componentes cliente lo importan, entre ellos `error.tsx` y `PublicHeader`. En el build local del 09-18 es un chunk de 286 KB (64 KB gzip) referenciado por 113 de 114 páginas: un visitante público recibe los textos del admin y de los correos. Solo `/marca` usa los metadatos. (H: no medido en navegador.) | `src/shared/copy/index.ts:1` | `copy-sync` emite un mapa código→texto para runtime, partido por sección de `docs/14`, y los metadatos aparte solo para `/marca`. Regla `noRestrictedImports` que prohíba `@/shared/copy` en `"use client"` (igual que ADR-076 con los iconos). | M |
| B2 | **Textos leídos por posición y sin tipo.** ~743 `tList()`, ~380 accesos `[n] ?? ""`, 88 mapeos `tList(...)[ENUM.indexOf(x)]`. Reordenar una fila en `docs/14` corre las etiquetas sin que falle nada. No existe `copy:check` que detecte deriva entre `docs/14` y el generado (`wordle:check` sí existe). | `src/shared/copy/index.ts:19`, `crm/domain/timeline-pure.ts`, `app/admin/layout.tsx:16-46` | Tuplas `as const` de largo fijo generadas por `copy-sync`; prueba que compare el largo de cada lista con su enum; `copy:check` en `check` y CI. | M |
| B3 | **Eventos de dominio sin contrato.** `type: string`, `payload: Record<string, unknown>`; 64 tipos emitidos desde ~102 sitios; ningún módulo tiene el `events.ts` que promete la arquitectura. El payload de `checkin.approved` se revalida por separado en 5 consumidores; `timeline-pure.ts` lee con `str(payload, key)` que devuelve `""` si la clave falta. El poller descarta con un `warn` un evento sin handler: un error de tipeo pierde el evento en silencio. | `src/db/tx.ts:29-34`, `src/jobs/registry.ts:13-17`, `src/jobs/poller.ts:35-38` | `events.ts` por módulo productor con `defineEvent(nombre, zod)`; `emit` y `registerHandler` tipados contra el catálogo; prueba que compare emitidos con registrados. Es aditivo: se migra evento por evento. | M |
| B4 | **`participation` son tres subdominios** (núcleo, gamificación, juegos) en 85 archivos y 18,5k líneas, con acoplamiento núcleo↔gamificación en ambos sentidos (`check-ins.ts` llama a boosters y retos en 4 bloques copiados; `boosters.ts` importa `challenges` y viceversa). Los juegos solo dependen del esquema y de un helper de fecha: son separables. | `participation/domain/check-ins.ts:9-21,268,383,457,556`, `boosters.ts:25`, `challenges.ts:676-740` | Ver la reorganización en 5.2. | M-L |
| B5 | **El ledger no tiene un comando de crédito.** Los tres juegos hacen `insert(pointEntry)` a mano; `lockTerm` copiado 4 veces, `eligible` 3, `lockPerson` y `nextDayAt` 2. `pointEntry` es polimórfica: cada juego suma un valor al enum, una FK anulable y 2 CHECK. El Sudoku tocó 7 archivos de `participation` más `timeline-pure.ts` y `mis-datos`. | `wordle.ts:272`, `game2048.ts:319`, `sudoku.ts:393`, `participation/schema.ts:459-493` | `creditPoints(ctx, {kind, sourceId, …})` en el ledger y un helper `dailyRun` (lock de término, lock de persona, elegibilidad). ADR que decida si el cuarto juego usa `sourceType/sourceId`. | S + M |
| B6 | **Superficie pública enorme y mezclada.** `participation/index.ts` exporta 380 símbolos, `people` 232, `crm` 150. Mezclan lecturas, comandos `*As` y comandos crudos con `ctx` que saltan el wrapper; varios solo los usan pruebas o nadie. Son los archivos con más commits del repo. | `src/modules/*/index.ts` | `index.ts` (lecturas y `*As`), `internal.ts` (comandos con `ctx` para componer transacciones, ADR-037) y `testing.ts`; regla de depcruise para que `src/app` no importe `internal`. | M |
| B7 | **No hay primitives de UI.** `src/shared/ui` solo tiene `AreaSwitch`, `Markdown` e `icons/` (la arquitectura dice «shadcn base», que no existe). En `src`: 509 `<input`, 99 `<select`, 45 `<table`, 118 `<button` crudos; el patrón de tarjeta repetido 72 veces; 72 `role="alert"` en 12 variantes; el banner de guardado copiado 18 veces; 115 estados vacíos en línea. Las primitives reales viven en el admin-kit y dependen de 22 clases `admin-*` definidas en `src/app/admin/admin.css`: `shared` depende de un CSS de `app`. | `src/shared/ui/`, `src/shared/admin-kit/ResourceForm.tsx:23`, `src/app/admin/admin.css` | Crear `Button`, `Field`, `Input`, `Select`, `Card`, `Table`, `Dialog`, `Alert`, `SavedBanner`, `EmptyState` en `shared/ui`; mover el CSS del kit junto al kit. Riesgo visual, cubierto por E2E. **Es requisito para que una app hermana reutilice algo más que los tokens.** | L |
| B8 | **Navegación del admin escrita cuatro veces**: `enlaces` y `groupDefs` en el layout (una ruta que falte en el segundo desaparece del menú sin aviso), `admin/page.tsx` y `PROTECTED` del proxy. | `src/app/admin/layout.tsx:37-214`, `src/proxy.ts:9` | Una tabla `ADMIN_NAV {href, código T, grupo, acceso}` y una prueba que exija un `page.tsx` por href. | S |
| B9 | Admin-kit: los 34 recursos se registran con `as unknown as AnyResource` (34 de los 38 `as unknown as` del repo); no existe el `defineResource` que citan ADR-017 y la arquitectura; dos botones de envío casi iguales y dos menús de acciones. | `src/app/admin/_kit/registry.ts:144-177` | Un `register<T>()` genérico; unificar duplicados. | S-M |

### C. Duplicación y convenciones

| # | Hallazgo | Evidencia | Arreglo | Esf. |
|---|---|---|---|---|
| C1 | **Helpers de server actions copiados** en 50 archivos (~5.900 líneas): `text(formData)` ~23 copias (dos sin `trim`), `requireAdmin` 13 (ya existe `requireAdminActor` en `identity/current.ts:44`), `withQuery` 8, `back` 10, `safeBack` 5 con tres regex distintas (ya existe `safeNextPath`), `single()` ~45 páginas, regex de id definidas 58 veces en 7 variantes, 73 a 79 bloques `try/catch DomainError`. | p. ej. `src/app/admin/ledger/actions.ts:37,54` | `src/app/_lib/` con `form.ts`, `search.ts`, `ids.ts`, `run-action.ts`; migrar carpeta por carpeta. | M |
| C2 | Sin tipo común para el estado de las actions: 140 de 161 devuelven `void` y redirigen con `?error=<mensaje>`; ~35 páginas pintan `search.error` tal cual. React escapa (no es XSS), pero un enlace armado muestra un texto arbitrario con apariencia oficial dentro del admin. | `src/app/admin/pipelines/[id]/page.tsx:87`, `admin/solicitudes/page.tsx:52,105` | Códigos `T-…` en la URL o `useActionState` (ya en 14 archivos). | M |
| C3 | Contexto del actor inconsistente: 29 llamadas pasan `{ personId }` sin IP, 66 pasan `clientIp()`, una `ip: null`. (H: en esos comandos la auditoría queda sin IP.) | `src/app/admin/organizaciones/[id]/actions.ts:46-49` | Un único `actorContext()`. | S |
| C4 | Autorización compuesta en cuatro archivos con cuatro nombres; un handler del API importa desde la carpeta de una página. | `admin/_kit/acceso.ts`, `admin/comites/_kit/capacidades.ts`, `admin/ocasiones/[id]/authz.ts`, `admin/permanencia/authz.ts`, `api/ocasiones/[id]/live/route.ts:1` | Reunir en `src/app/_authz/`. Ya hay pruebas de integración que lo cubren. | S |
| C5 | **Páginas y componentes gigantes**: `Paneles.tsx` es una función de ~850 líneas con 15 ramas `if (accion === …)`, complejidad 116, que repite precondiciones del dominio; `pipelines/[id]/page.tsx` 594; `ocasiones/[id]/page.tsx` 573; `personas/[id]/page.tsx` dispara más de 20 lecturas según la pestaña. 23 `page.tsx` superan las 300 líneas. Coinciden con los archivos de más churn. | `src/app/admin/personas/[id]/_ui/Paneles.tsx:93-923` | Un archivo por panel con mapa `accion → componente`; un cargador por pestaña; lecturas por comité en `people`. | L |
| C6 | Lógica de negocio en páginas: aritmética de asambleas duplicada (ya existe `requiredTotal` en `assembly-pure.ts:89`); qué sanciones registra un comité decidido en la página; `GROUP_KINDS` copiado 3 veces y `DECISIONS` 2, atados a etiquetas por posición. | `admin/personas/[id]/page.tsx:209-227`, `app/gh-points/page.tsx:88-97`, `admin/comites/[slug]/permanencia/page.tsx:109` | Cada módulo exporta sus `*_OPTIONS` y helpers de etiqueta. | M |
| C7 | Archivos de dominio gigantes que mezclan responsabilidades: `challenges.ts` 1086, `badges.ts` 1000, `challenge-participation.ts` 952 (con `applyPresentialCheckIn` de 215 líneas), `permanence-pure.ts` 1098 (`computeCriterion` de 214), `boosters.ts` 789, `roster.ts` 812 (`applyRow` de 173), `timeline-pure.ts` (`summarizeEvent`: 491 líneas, 44 `case`, complejidad 141, 17 commits). | — | Partición por flujo (comandos, lecturas admin, lecturas de miembro). `summarizeEvent` pasa a un registro por tipo de evento apoyado en B3. Son movimientos de código con pruebas `*-pure` de red. | M c/u |
| C8 | Tres estilos de error: `DomainError` (~400 sitios), `throw new Error` (~180, 71 son «No se pudo…» tras un `returning()` vacío) y resultados `{ok:false}` (144). `DomainError` vive en `shared/admin-kit/` y lo importan 73 archivos de dominio, 42 de ellos por un barrel que también exporta componentes cliente. | `src/shared/admin-kit/DomainError.ts` | Mover a `shared/lib/errors.ts` (con reexport temporal), sumar `NotFound` y `Conflict`, helper `firstOrThrow`, y documentar cuándo usar cada estilo. | S-M |
| C9 | `shared/lib/dates.ts` importa `getEnv`, así que ni los componentes cliente ni los `*-pure.ts` pueden usarlo. Consecuencia: `"America/Bogota"` escrito a mano en 6 archivos, literales `-05:00`, un desfase calculado a mano en `wordle-pure.ts:55`, `addDays`/`dayKey` duplicados. | `src/shared/lib/dates.ts:1` | `dates-pure.ts` sin entorno y `dates.ts` como envoltorio de servidor. | S |
| C10 | Helpers chicos repetidos: quitar acentos (8 veces, dos regex), `escapeHtml`, `hashToken`, `round2`, `blankToUndefined`, `normalizeHeader`, dos CSV (`lib/csv.ts` y `admin-kit/csv.ts`), 18 advisory locks con SQL a mano y dos funciones de hash distintas. | — | A `shared/lib`; `advisoryLock(tx, key)` en `src/db`. | S |
| C11 | Tres subidores casi iguales (~60 líneas de presign, POST y confirm) y dos tableros de juego que comparten el manejo de almacenamiento local. | `DocumentUploader.tsx`, `MediaUploader.tsx`, `PhotoUploader.tsx`, `Sudoku.tsx`, `Game2048.tsx` | Hook `usePresignedUpload`; helper común de partida diaria. | M |
| C12 | Piezas en el módulo equivocado: `aliasesResource` (de `system`) en `participation/admin.ts:631`; `participation.term-check` (asunto de `terms`) en `participation/jobs.ts:95`; `TeamParticipations.tsx` (negocio de permanencia) en `shared/brand`. Wrappers `*As` con dos convenciones (un `commands.ts` central o junto al dominio); `crm` usa ambas. `people/domain/reads.ts` y `people-reads.ts` con el mismo propósito. | — | Mudanzas mecánicas; elegir una convención y documentarla. | S |
| C13 | Convenciones de carpetas mezcladas en `src/app`: 7 `_ui`, 2 `_kit`, 1 `_components`, 11 componentes sueltos junto a `page.tsx`, tres nombres para el estado (`state.ts`, `form-state.ts`, `acceso-state.ts`). Nombres: 105 funciones en español contra la regla de identificadores en inglés; specs E2E y componentes mezclan idiomas; `pure.ts` (3) contra `*-pure.ts` (39). | — | Convención de 5.1; renombres solo al tocar el archivo, no en masa. | S |
| C14 | Sin `loading.tsx`, `Suspense` ni `global-error.tsx`; solo `error.tsx` y `not-found.tsx` de raíz. 19 `generateMetadata` releen la entidad sin `cache()` (lectura doble por request). | — | `loading.tsx` y `error.tsx` en `/admin` y `/app`; `cache()` en las lecturas de metadata. | S |
| C15 | Dos lecturas N+1 reales (`badges.ts:833-850`, `campaigns.ts:428-430`). De ~186 lecturas `list*`, 124 no tienen `limit`; la mayoría filtra por persona o término, pero ledger y check-ins por persona crecen sin tope. 25 `.transaction(` directas fuera de `src/db` que saltan auditoría y `emit`. | — | `inArray`; paginar ledger y check-ins; permitir que `runCommand` reciba una `tx`. | S-M |

### D. Limpieza: borrar o archivar

| Qué | Por qué | Arrastra |
|---|---|---|
| `scripts/migrate-ghpoints.ts`, `scripts/verify-migration.ts`, `scripts/lib/migrate-ghpoints.ts`, `scripts/lib/migrate-participation.ts`, `tests/integration/migrate-ghpoints.test.ts` (**2.024 líneas**) | `docs/08` dice que no se migran datos (ADR-039) y GHPOINTS se retiró el 09-08. Se compilan, lintean y prueban en cada `check`. **No tocar** `import-ghpoints.ts` ni `lib/ghpoints-{db,plan,files}.ts`: se usaron en producción el 09-14 (ADR-062). | `package.json:32,34`, `.env.example:74-75` (`GHPOINTS_DATABASE_URL`), su clave en `scripts/ci/integration-durations.json` |
| `.impeccable/` (35 archivos, 11,2 MB de PNG versionados) | No es código ni doc viva. | `biome.json:20`, `.gitignore:57` |
| 4 JSON y 3 `.md` fechados en `docs/` (`assessment-ci-cd-*`, `auditoria-pruebas-*`, `ci-cd-*`, `verificacion-e2e-*`) | Informes, no docs vivas. A `docs/informes/2026-09-11/`. | `scripts/ci/documentation-paths.json`, `tests/unit/ci-policy.test.ts:19`, enlaces en `docs/09` y `docs/10` |
| `@aws-sdk/client-sesv2` | Solo lo usa `mail.ts` en un camino que ADR-039 dejó apagado. **Decisión tuya**: si SES no vuelve, se quita. | rama SES de `mail.ts`, variables AWS en `env.ts` |
| `LaOE/public/` (solo `.DS_Store`), `tests/integration/tmp/` (vacío), 1,6 MB de fuentes de diccionario en `participation/data/wordle/sources/` (en runtime solo se usan los JSON de `versions/`) | Restos. | — |
| `knip.ts:6` declara `scripts/*.ts` como entrada | Por eso un script muerto nunca se detecta. | Listar las entradas reales. |

### E. Documentación, CI y herramientas

| # | Hallazgo | Arreglo | Esf. |
|---|---|---|---|
| E1 | **La arquitectura documentada no coincide con el código.** `docs/01` y `AGENTS.md` dicen que cada módulo tiene `actions.ts` y `events.ts`: solo `identity` y `system` tienen `actions.ts`; las 161 actions reales viven en 50 archivos de `src/app` (con razón válida: componen varios módulos). `admin.ts` existe en 11 de 13 módulos con convención coherente, pero no está en la arquitectura. Dependencias no declaradas: `crm → participation` (contradice ADR-035), `crm → events`, `crm → identity`, `identity → comms`. «shadcn base» y `defineResource` no existen. | ADR corta de enmienda que fije la convención real. Importa el doble porque `AGENTS.md` obliga a cada sesión a leer ese documento antes de codificar. | S |
| E2 | Documentos vivos que crecen sin límite: `09-roadmap.md` 327 KB (registro de avances de la línea 549 a la 994, líneas de más de 2.000 caracteres), `15-runbook.md` 152 KB (procedimiento mezclado con bitácora), `14-copy-y-textos.md` 259 KB. Cada sesión de agente paga ese costo de contexto. | `docs/bitacora/2026-09.md` para avances y sucesos; roadmap solo con estado y pendientes; runbook solo con procedimientos. Actualizar `documentation-paths.json`. | M |
| E3 | Duraciones de partición del 09-11: no pesan 8 de 61 archivos E2E (`gamificacion`, `sudoku`, `juegos`) ni 28 de 93 de integración. (H: desbalance no medido en corridas reales.) | Refrescar desde el `ci-result` de `main` en un job semanal o al promover (los subcomandos ya existen). | S |
| E4 | Seis `next build` y cinco `playwright install` por corrida de CI; la facturación de Actions ya falló una vez. | Compilar una vez y pasar `.next` como artefacto. (H: ahorro no medido.) | M |
| E5 | `npm run check` encadena 8 pasos en serie y exige `uv` + Python 3.12 aunque no cambie el extractor. | `check:fast` en paralelo (lint, tipos, deps, knip, unitarias) como pre-push; extractor condicionado a sus rutas. | S |
| E6 | Helpers de prueba duplicados: `drenar()` en 7 archivos **con semántica distinta**, `seedMember` local en 7, ~100 líneas de preámbulo en cada `gamification-*`; 42 de 61 specs E2E insertan con Drizzle directo sin reutilizar las factories; `global-setup.ts` (419 líneas, 32 commits) parchea el seed de desarrollo. Seeds organizados por fase histórica (`seed-fase5.ts`, `seed-fase6.ts`). | `tests/support/` con `outbox.ts` y `factories/` por módulo, compartido entre integración y E2E; `scripts/seed/` por módulo. | M |
| E7 | Producción ejecuta TypeScript con `tsx` (devDependency) en el pre-deploy. | Compilar `db-release` a JS en el build. | M |
| E8 | `next typegen` reescribe `tsconfig.json`; `drizzle/meta` pesa 11,3 MB y crece ~450 KB por migración; sin Dependabot ni Renovate; mayores pendientes: TypeScript 7, Vitest 5, `@types/node` 26; ADR-042 falta en el índice; `finance` es el módulo con menos pruebas (1.558 líneas, 66 de unitarias). | Excluir `tsconfig.json` de Biome; squash futuro a línea base; Renovate con agrupación. | S |

## 5. Organización de carpetas propuesta

### 5.1 `src/app`

```
src/app/
  _lib/      form.ts, search.ts, ids.ts, run-action.ts, actor-context.ts   (sin JSX)
  _authz/    admin-area.ts, committee.ts, occasion.ts, group.ts
  admin/
    _kit/    registry.ts, ResourcePage.tsx, actions.ts, nav.ts (ADMIN_NAV única)
    _ui/     AdminShell.tsx
    personas/[id]/
      page.tsx      guard + carga + composición; sin reglas
      actions.ts    una por ruta; estado en state.ts
      _ui/          paneles/EditarPanel.tsx, tabs/TabMembresia.tsx
```

Reglas: lo que usa una sola ruta va en su `_ui/`; lo que usan dos o más rutas de un mismo módulo va en `src/modules/<m>/components`; lo que no tiene negocio va en `src/shared/ui`; nunca se importa desde la carpeta de otra ruta. Un solo nombre: `actions.ts` y `state.ts`.

### 5.2 `src/modules` y la partición de `participation`

Cada módulo: `index.ts` (lecturas y `*As`), `internal.ts` (comandos con `ctx`), `testing.ts`, `events.ts` (catálogo Zod), `schema.ts`, `admin.ts`, `jobs.ts`, `domain/`, `components/`.

```
participation/
  domain/core/           occasions, check-ins, ledger (+creditPoints), rankings, scores, closing,
                         assemblies, viability, surveys, reminders, agenda, live
  domain/gamification/   challenges*, rewards, boosters, boost-campaigns, checkin-hooks,
                         badges*, reconciliation, evidence, metrics
games/                   módulo nuevo: schema.ts (wordle_*, game2048_run, sudoku_run),
                         domain/{wordle, game2048, sudoku, daily-run}, *-engine.ts, components/, data/
```

Orden seguro, un PR por paso y sin cambio de comportamiento en los tres primeros:

1. `creditPoints` y `dailyRun` dentro de `participation`; los tres juegos los usan.
2. Unificar en `checkin-hooks.ts` los 4 bloques duplicados; `check-ins` recibe los hooks por parámetro (corta núcleo → gamificación).
3. Mover a `core/` y `gamification/` y agregar la regla de depcruise `core ↛ gamification`.
4. Que `badges.ts:126-139` deje de leer `wordleGame` directo (H: confirmar que una reversión no rompe la equivalencia victoria = crédito).
5. Extraer `games` (depende de `participation`, `people`, `terms`). Los nombres de tabla no cambian. (H: `db:generate` debería dar «sin cambios», como pasó con `terms` en ADR-035.)
6. Promover `gamification` a módulo propio solo si sigue creciendo.

### 5.3 `src/shared` con forma de paquete (sin crear paquetes todavía)

| Futuro paquete | Contenido | Qué desacoplar antes |
|---|---|---|
| `brand` | `tokens.css`, fuentes, `Cartel`, `Elemento`, `Insignia`, `BarraTitulo`, logos, `ThemeToggle`, OG | Pasar por props los `t()` de `LogoOE` y `SelloOE`; quitar rutas absolutas `/logos/…` y el `process.cwd()/src/…` de `og/fonts.ts`; sacar `TeamParticipations` |
| `ui` | Primitives nuevas (B7), `Markdown`, iconos | Primero hay que crearlas |
| `copy` | `copy-sync`, `t`, `tList`, `render`; cada app con su inventario | Parametrizar origen y destino; B1 y B2 |
| `db` | `client`, `tx`/`runCommand`, `errors`, `columns` | `tx.ts:2` importa `@/modules/system/schema`: inyectar tablas o mover `auditLog` y `outbox` |
| `jobs` | `poller`, `scheduler`, `registry`, `backoff` | `SCHEDULE` y `handlers.ts` son de cada app; catálogo tipado (B3) |
| `adapters` | `mail`, `storage`, `pusher` | Configuración por parámetro en vez de `getEnv` (como ya hace `mail`) |
| `lib` | `dates-pure`, csv unificado, `money`, `request`, `log`, `errors` | `seo.ts:21` recibe T-001 por parámetro |
| `admin-kit` | `Resource*`, `Admin*` | 28 códigos T a props; mover `admin.css`; quitar `/admin` escrito |

### 5.4 Pruebas, scripts, docs y la carpeta `LaOE/`

```
tests/support/        outbox.ts, factories/<módulo>.ts   (compartido integración + E2E)
scripts/seed/         <módulo>.ts                        (en vez de seed-fase5, seed-fase6)
scripts/{ops,gen,ci}/ operación, generadores, CI
docs/informes/<fecha>/  informes fechados y sus JSON
docs/bitacora/<mes>.md  registro de avances y sucesos de producción
```

`LaOE/`: `informes/` fuera del repo está bien; `outputs/` sale de `GitHub/` (A8); `public/` se borra.

## 6. Apps hermanas: `dias`, `enfemenino`, `inventiva`

### Hechos del código

- `event`, `event_edition` y `edition_committee` ya existen, con slugs fijos `inventiva`, `enfemenino` y **`dias-eafit`** (los docs dicen «Días EAFIT», nunca «Días OE»; hay un cuarto: Subsidios-OE). Hay páginas `/eventos/[slug]/[edicion]` que los docs ya llaman «micrositio», inscripción por formulario que crea persona y `edition_registration`, pantalla de inscritos y check-in `EDITION_SESSION`.
- Están **vacíos**: descripciones T-016 y T-017 pendientes y cero ediciones en producción. Un evento no tiene tema, logo, paleta ni bloques propios; una página editable es slug + Markdown sin ámbito de sitio.
- Todo el dominio corre en proceso: no hay API de máquina a máquina (ni bearer, ni API key, ni CORS). La CSP lleva `connect-src 'self'` y `form-action 'self'`.
- Un solo host: `APP_URL` única alimenta `metadataBase`, sitemap, correos, push, QR y billeteras. HSTS con `includeSubDomains` ya está publicado: todo subdominio nace en HTTPS.
- La marca es solo OE: tokens `--color-oe-*`, el manual prohíbe colores fuera de la gama y no hay logos de macroeventos. La convivencia de logos sigue pendiente en el backlog de diseño.
- Costo: tope US$20, alerta US$15. Única medición documentada (09-06, antes del roster): US$2,89 proyectado, web en 190 MB. (H: un segundo servicio Next consumiría 200 a 300 MB, unos US$2 a 4 por entorno.)
- Monorepo hoy es L: la raíz del repo es la app, `@/*` tiene 3.440 imports, el CI asume la raíz (`hashFiles('src/**')`, particiones por ruta, clasificador de dos modos, un único gate requerido «CI»), los watch patterns de Railway son `**` por principio (ADR-053 regla 7).

### Tres caminos

| | 1) Mismo despliegue, varios hosts | 2) Monorepo, un servicio por app | 3) Repos separados + API |
|---|---|---|---|
| Costo mensual extra | ~US$0 | US$4 a 8 por app con staging: tres apps rebasan el tope (H) | Igual que 2 en Railway; ~US$0 si es estático en Cloudflare Pages |
| CI | Mismo gate; smoke y E2E ganan un host | Alta: clasificador por app, watch patterns, caché, minutos de Actions | Media por repo, tooling duplicado |
| Reutilización | Máxima: módulos, formularios, inscritos, admin | Alta tras extraer paquetes; el dominio solo si se comparte la base | Baja: marca copiada, datos por HTTP |
| Aislamiento | Ninguno: mismo proceso de 1 GB; un pico de un evento compite con el check-in | Separa procesos, no la base | Máximo |
| Trabajo previo | Sitio por host en el proxy, bloquear `/app` y `/admin` en hosts de evento, layout/manifest/íconos por host, tema por evento, hosts en E2E | Mover la raíz, workspaces, reescribir CI, IaC y ADR-053, extraer paquetes | Diseñar API con auth y versionado; ADR de contrato |

### Recomendación

**No pasar a monorepo ahora y no crear apps separadas para lo que sea contenido más inscripción.** Camino híbrido:

1. Los micrositios de evento se sirven **desde casa-digital por host** (camino 1): los datos, los formularios, los inscritos y el admin ya viven ahí, el costo es cero y el tope de US$20 no da para tres servicios con staging. Requiere una ADR («sitios por host») que amplíe `events`/`content` con tema por evento y ámbito de sitio.
2. Una app separada solo se justifica cuando tenga **datos y lógica propios** (boletería, votación) o la desarrolle otro equipo. Para ese día, el trabajo de las secciones 5.2 y 5.3 deja las carpetas con forma de paquete y el paso a workspaces de npm se hace al arrancar esa primera app, en este orden: marca, copy, ui, y por último db y jobs. Antes de mover, parametrizar `APP_ROOT` en `scripts/ci/*`.
3. En ambos casos, **ya**: cookie `__Host-` (A5) y ADR que decida entre sesión aislada por app o SSO. Compartir la cookie con `Domain=oeeafit.com` entrega el token de sesión de un ADMIN a cualquier app del dominio: mi recomendación es sesión aislada salvo que un evento necesite login de miembros.

El riesgo del camino 1 es el aislamiento. Se mitiga con A1, A2 y A9 (que hay que hacer igual) y midiendo memoria en la primera edición real; si un evento tensiona el proceso, ese sitio se muda a un servicio propio con los paquetes ya extraíbles.

### Preguntas de producto que definen el camino

1. ¿Son sitios de contenido (landing, agenda, patrocinadores, inscripción) o apps con datos propios (boletería, votación, retos)?
2. ¿Necesitan login de miembros o solo inscripción pública?
3. ¿Habrá check-in de asistentes externos? Hoy no existe: un externo solo entra por el modo anfitrión.
4. ¿Quién edita cada sitio: la mesa del evento desde `/admin` o alguien con código? ¿Alcanza Markdown con portada o hace falta un constructor por bloques?
5. ¿Cada evento tiene identidad propia aprobada (logo, paleta)? ¿El manual OE lo permite en la web?
6. ¿El subdominio es `dias` para Días EAFIT? ¿Subsidios-OE también entra?
7. ¿Qué tráfico y estacionalidad se esperan? ¿Coinciden con días de check-in masivo?
8. ¿Desarrollas solo tú u otros equipos con otro stack?
9. ¿El tope de US$20 es inamovible? ¿Cada app necesita staging?
10. ¿Las ediciones pasadas quedan archivadas en el mismo subdominio?

## 7. Plan por tramos

Siguiendo la regla de la casa: cada tramo entra primero a ADR o roadmap, va en rama desde `origin/main` con PR, y cierra con `npm run check` y E2E en verde. Orden pensado para: seguridad primero, borrar antes de mover, y descentralizar los registros antes de volver a trabajar en paralelo.

El plan completo tiene dos series. La serie **V** (verificar y medir) cubre lo que esta auditoría no alcanzó y corre en paralelo con los primeros tramos de refactor. La serie **R** (refactor) es el trabajo sobre el código. Los esfuerzos son estimaciones gruesas con el flujo actual de un PR por paso y CI de por medio.

### Serie V — verificar y medir

| Tramo | Contenido | Listo cuando | Esf. | Condiciona |
|---|---|---|---|---|
| **V0 · Línea base** | Script repetible que imprime las métricas de la sección 8 | Un comando da la tabla y queda guardada la primera medición; se vuelve a correr al cerrar cada tramo | Medio día | Todos |
| **V1 · Hipótesis que condicionan decisiones** | Cómo llega la cabecera de IP en staging; fijación de sesión entre subdominios; prueba de concepto de rewrite por host con Server Actions en Next 16; chunk de textos medido en navegador sobre el HEAD; auditoría sin IP; eventos emitidos sin handler contra el registro real; nombre de la entidad en el `<title>` | Cada hipótesis de la sección 9 queda confirmada o descartada en este informe | 1 a 2 días | A3 y A5 de R0; R2; R4; R8 |
| **V2 · Seguridad** | `npm audit`; que cada guard sea el correcto y no solo que exista; alcance por comité (ADR-072) caso por caso; tokens de carnet, ICS y baja; `returnTo` sin `safeNextPath` en `acceso-actions.ts:36` | Informe de seguridad aparte; lo crítico entra a R0 | 2 a 3 días | R0 |
| **V3 · Base de datos** | Solo lectura contra producción (requiere tu autorización explícita del túnel): tamaños de tabla, consultas lentas, índices sin uso y faltantes, lecturas sin `limit` que de verdad crecen | Lista de consultas e índices a corregir, con números | 1 día | C15 en R7 |
| **V4 · Módulos poco cubiertos** | Misma lupa sobre `comms`, `content`, `identity`, `wallet`, `forms` y `finance`; cobertura de pruebas medida, no contada | Hallazgos sumados a las secciones 4 y 5 | 2 días | R3, R5 |
| **V5 · Decisiones de producto** | Las 10 preguntas de la sección 6, si SES vuelve, y el gasto real de Railway hoy | Respuestas anotadas | Tuyo | R8, sección D |

### Serie R — refactor

| Tramo | Contenido | Listo cuando | Esf. | Riesgo |
|---|---|---|---|---|
| **R0 · Robustez** | A1 (pool), A2 paso 1 (timeouts por SDK y por handler), A3 (IP, tras V1), A4 (índices y `truncateAll` derivados), A6 (un solo correo institucional), A7 (`Promise.all` en serie), A8 (`outputs/` fuera), `copy:check` | `check` y E2E en verde; una prueba falla si el esquema y la lista de índices divergen; `outputs/` ya no está bajo `GitHub/` | 1 a 2 días | Bajo |
| **R1 · Limpieza y docs** | Toda la sección D; E1 (ADR de enmienda de arquitectura); E2 (bitácora aparte de roadmap y runbook); C12 (mudanzas mecánicas entre módulos) | Las 2.024 líneas de GHPOINTS borradas; `docs/01` coincide con el código; knip sin entradas comodín para `scripts/` | 1 a 2 días | Bajo |
| **R2 · Copy** | B1 (mapa de runtime por sección, metadatos solo para `/marca`, regla de lint) y B2 (tuplas tipadas) | Ningún `"use client"` importa `@/shared/copy` y el lint lo impide; el chunk de textos desaparece del portal público; `tList` devuelve tuplas de largo fijo | 2 a 3 días | Bajo |
| **R3 · Kit de actions y navegación** | C1 (`src/app/_lib`), C3 (`actorContext`), C4 (`_authz`), B8 (`ADMIN_NAV` única), B9 (`register<T>`), C8 (`errors.ts`), C9 (`dates-pure`), C10, C13 (convención 5.1) | Cero copias locales de `requireAdmin`, `text`, `withQuery` y `safeBack`; una sola tabla de navegación con su prueba; `DomainError` fuera del admin-kit | 3 a 4 días | Bajo |
| **R4 · Eventos y poller** | B3 (catálogo tipado, evento por evento), `summarizeEvent` como registro por tipo (C7), A2 paso 2 (reserva con `lockedUntil`, fila por par evento-handler), A9 (recuperación de programados, salud del outbox) | Emitir un tipo no declarado no compila; el poller no sostiene la transacción mientras corre un handler; `/api/health` informa la cola | 4 a 5 días | Medio |
| **R5 · `participation`** | B5 (`creditPoints`, `dailyRun`), pasos 1 a 5 de la sección 5.2, B6 (`internal.ts`, `testing.ts`), partición de los archivos gigantes del módulo (C7) | Ningún juego inserta en `pointEntry`; depcruise prohíbe `core → gamification`; módulo `games` extraído con `db:generate` sin cambios; `src/app` no importa `internal` | ~1 semana | Medio (mueve puntos) |
| **R6 · UI base y páginas gordas** | B7 (primitives y CSS del kit junto al kit), C5 (partir `Paneles`, `pipelines`, `ocasiones`, `comités`), C6 (`*_OPTIONS` desde los módulos), C2 (errores por código), C11, C14 | Primitives en `shared/ui` y el kit sin depender de `src/app/admin/admin.css`; las cuatro páginas de más de 560 líneas partidas; ningún mensaje libre viaja en la URL | 1 a 2 semanas | Medio (visual; E2E de red) |
| **R7 · Pruebas y CI** | E6 (`tests/support`, seeds por módulo), E3 (duraciones refrescadas solas), E4 (un solo build), E5 (`check:fast`), E7, E8, C15 (con los números de V3) | Un solo `drenar()`; particiones que se refrescan sin intervención; un `next build` por corrida | 3 a 5 días | Bajo-medio (el gate es check requerido) |
| **R8 · Plataforma** | A5 con la ADR de sesión; ADR «sitios por host»; `APP_ROOT` parametrizado en `scripts/ci/*`; carpetas de la sección 5.3 con forma de paquete | Un host de evento sirve su micrositio en staging sin exponer `/app` ni `/admin`; mover la app de carpeta no rompe el CI | Según V1 y V5 | — |

### Orden y paralelismo

1. V0 y V1 primero (dos días). R0 puede arrancar a la vez, salvo A3 y A5, que esperan a V1.
2. R1, R2 y R3 seguidos: no cambian comportamiento. V2, V3 y V4 corren en paralelo y pueden sumarles ítems.
3. R4 y después R5, uno a la vez y con staging de por medio: tocan transacciones con puntos.
4. R6 es el más largo; se puede intercalar con funciones nuevas si cada función nueva ya nace con las primitives.
5. R7 cuando V3 tenga números. R8 al final, con V1 y V5 resueltos.

En total son del orden de seis a ocho semanas de trabajo si se hace todo en serie; R0 a R3 más V0 a V2 caben en unas dos.

### ADR que saldrían de aquí

1. Enmienda de arquitectura: dónde viven las actions, qué es `admin.ts`, `internal.ts`/`testing.ts`, dependencias reales entre módulos.
2. Catálogo tipado de eventos y modelo de ejecución del poller.
3. Partición de `participation` y módulo `games`; `creditPoints` y forma de `pointEntry` para el cuarto juego.
4. Copy en runtime: mapa por sección, tuplas tipadas, prohibición en cliente.
5. Primitives de `shared/ui` y convención de carpetas de `src/app`.
6. Sesión y subdominios: `__Host-`, aislada contra SSO.
7. Sitios por host para macroeventos (tema por evento, ámbito de sitio en `content`).

## 8. Métricas de referencia

Las mide `npm run audit:metrics` (`scripts/audit-metrics.ts`, solo lectura, [ADR-079](adr/ADR-079-limites-de-espera-y-esquema-verificado-desde-el-esquema.md) regla 11). Al cerrar un tramo se corre de nuevo y se agrega aquí su tabla, con la fecha y el commit, debajo de la anterior.

### Línea base · 2026-09-19 · `7edf50e`

| Métrica | Valor |
| --- | --- |
| Archivos y líneas en `src` (sin el catálogo de textos) | 645 · 98985 |
| Líneas en `src/app` · `src/modules` | 34885 · 59529 |
| Funciones de más de 100 · 200 · 300 líneas (`src` y `scripts`) | 159 · 54 · 25 |
| Funciones con complejidad mayor a 30 | 64 |
| Archivos de más de 500 · 1000 líneas | 41 · 6 |
| Exports de `participation` · `people` · `crm` (`index.ts`) | 380 · 232 · 150 |
| Nombres de función de nivel superior declarados en 2 o más archivos de `src` | 81 |
| Copias locales de helpers de actions en `src/app` | requireAdmin 13 · text 23 · withQuery 8 · safeBack 5 · back 10 · single 44 |
| `as unknown as` en `src` | 37 |
| `tList(` · accesos posicionales `[n] ?? ""` en `src` | 742 · 381 |
| Componentes cliente · los que importan `@/shared/copy` | 56 · 25 |
| `throw new Error(` en `src` | 134 |
| `getDb()` en `src/modules` | 413 |
| Elementos crudos en `src` (input · select · table · button) | 509 · 99 · 45 · 118 |

### Tras R1-A y R2-A · 2026-09-19

| Métrica | Valor |
| --- | --- |
| Archivos y líneas en `src` (sin el catálogo de textos) | 648 · 99270 |
| Líneas en `src/app` · `src/modules` | 34849 · 59543 |
| Funciones de más de 100 · 200 · 300 líneas (`src` y `scripts`) | 155 · 51 · 23 |
| Funciones con complejidad mayor a 30 | 61 |
| Archivos de más de 500 · 1000 líneas | 39 · 5 |
| Exports de `participation` · `people` · `crm` (`index.ts`) | 380 · 232 · 150 |
| Nombres de función de nivel superior declarados en 2 o más archivos de `src` | 83 |
| Copias locales de helpers de actions en `src/app` | requireAdmin 13 · text 23 · withQuery 8 · safeBack 5 · back 10 · single 44 |
| `as unknown as` en `src` | 37 |
| `tList(` · accesos posicionales `[n] ?? ""` en `src` | 741 · 381 |
| Componentes cliente · los que importan `@/shared/copy` | 56 · 0 |
| `throw new Error(` en `src` | 134 |
| `getDb()` en `src/modules` | 413 |
| Elementos crudos en `src` (input · select · table · button) | 509 · 99 · 45 · 118 |

Lo que movieron: R1-A quitó cuatro funciones de más de 100 líneas y un archivo de más de 1.000 (el ensayo de GHPOINTS); R2-A dejó en cero los componentes cliente que importan el catálogo completo. El chunk de textos en el navegador, medido en el build, pasó de 286 KB (64 KB gzip) a 29 KB (11,6 KB gzip).

Dos cifras de la sección 4 no las mide el script y quedan como referencia de la auditoría: el chunk de textos en el navegador (286 KB, 64 KB gzip, en un build del 2026-09-18) y las 2.024 líneas muertas de la migración de GHPOINTS.

## 9. Hipótesis sin verificar

- Que un error del pool tumbe el proceso (comportamiento documentado de `pg`, no reproducido) y el impacto real de un handler colgado en el poller.
- Que el primer valor de `X-Forwarded-For` sea falsificable en producción: depende de si el edge de Railway reescribe la cabecera. **Comprobar en staging antes de cambiar A3.**
- La fijación de sesión desde un subdominio hermano (A5).
- Que el nombre de la entidad llegue al `<title>` para un rol del admin que no es ADMIN (C14).
- El ahorro de compartir el build en CI, el desbalance real de las particiones y el peso de `tsx` en la imagen de runtime.
- Consumo de un segundo servicio Next y gasto real de Railway hoy (no hay medición posterior al roster).
- Comportamiento de enlaces y Server Actions detrás de un rewrite por host en Next 16 (no probado): conviene un spike corto antes de la ADR de sitios por host.
- Que `db:generate` dé «sin cambios» al extraer `games`.

### Resueltas en V1

| Fecha | Hipótesis | Resultado |
| --- | --- | --- |
| 2026-09-19 | La auditoría queda sin IP cuando la action pasa solo `{ personId }` | **Confirmada.** `runCommand` escribe `ip: actor.ip ?? null` (`src/db/tx.ts`) y 30 sitios de `src/app/**/actions.ts` arman el actor sin IP; por ejemplo, toda la ficha de organizaciones (`admin/organizaciones/[id]/actions.ts`, `actorFor`). Se corrige en R3 con un único `actorContext()`. |
| 2026-09-19 | Unos 25 tipos de evento emitidos no tienen handler | **Descartada.** Los 64 tipos emitidos tienen consumidor: los 20 que no aparecen como literal en ningún `jobs.ts` están en `TIMELINE_EVENTS` (`crm/domain/timeline-pure.ts`) y se registran en bucle desde `crm/jobs.ts`. El riesgo de fondo sigue: un nombre mal escrito se descarta con un `warn`, y eso lo cierra el catálogo tipado de R4. |
| 2026-09-19 | El chunk de textos llega al navegador con el catálogo completo | **Confirmada y corregida** en R2-A ([ADR-081](adr/ADR-081-el-catalogo-de-textos-no-viaja-entero-al-navegador.md)). El grafo real del bundle, cortando en los archivos `"use server"`, tenía 28 archivos que importaban `@/shared/copy`. Tras el cambio, ningún chunk de `.next/static` contiene metadatos editoriales ni textos de solo servidor. |
