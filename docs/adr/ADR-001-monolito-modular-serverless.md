# ADR-001: Monolito modular con un solo Postgres

- Estado: Aceptada (enmendada por ADR-021, ADR-032 y ADR-080)
- Fecha: 2026-09-02
- Relacionadas: ADR-012, ADR-017, ADR-021

## Contexto

Una sola persona mantiene el sistema, el presupuesto es de unos US$20 al mes y el principio rector es "un solo lugar". El dominio tiene muchas áreas (personas, participación, contenido, formularios, comunicaciones) que crecerían desordenadas si se organizan solo por tipo técnico. En la redacción original el hosting era Vercel, sin procesos permanentes; ver la enmienda.

## Decisión

Una aplicación Next.js (App Router) organizada por **módulos de dominio** en `src/modules/*`. Cada módulo es dueño de su esquema, sus comandos, sus lecturas, sus acciones, sus jobs y sus componentes. Los módulos no se importan por dentro: exponen lecturas explícitas y publican eventos de dominio. Un único PostgreSQL guarda datos, outbox, sesiones, rate limit y búsqueda (`pg_trgm`). No hay Redis ni colas de terceros.

## Consecuencias

- Un repositorio, un despliegue, un esquema; el módulo es la unidad de orden y de revisión.
- Las fronteras entre módulos se cuidan con una regla de lint de imports, no con procesos separados.
- Los cálculos de fondo deben ser cortos e idempotentes.

## Frente a GHPOINTS

GHPOINTS también es un monolito, pero organizado por capas (`actions`, `domain`, `components`) y con efectos derivados coalescidos por instancia de proceso. Aquí la organización es por módulo y la coordinación pasa por Postgres.

## Enmienda (2026-09-02, ADR-021)

El servicio web corre en Railway y sí tiene un proceso permanente: el poller del outbox y el scheduler de programados viven en el mismo proceso que la app (`instrumentation.ts`). Sigue sin haber Redis ni colas de terceros; las opciones "Vercel Queues o Workflows" dejan de existir. El título original ("sobre serverless") ya no aplica; el archivo conserva su nombre por estabilidad de enlaces.

## Enmienda (2026-09-03, ADR-032)

El esquema de cada módulo es un archivo TypeScript (`src/modules/<módulo>/schema.ts`) con Drizzle; el módulo sigue siendo la unidad de orden y de revisión. Ver [ADR-032](ADR-032-drizzle-y-esquema-por-modulo.md).

## Enmienda (2026-09-19, ADR-080)

La estructura de un módulo es `schema.ts`, `domain/`, `index.ts`, `admin.ts`, `jobs.ts` y `components/`. Las server actions viven en `src/app/**/actions.ts`, junto a su ruta, porque componen los guards de `identity` con comandos de uno o varios módulos; solo `identity` y `system` tienen `actions.ts` propio. No hay `events.ts` hasta que exista el catálogo tipado de eventos. El grafo permitido entre módulos es la tabla `MODULE_DEPS` de `.dependency-cruiser.cjs`, y `npm run deps:check` la verifica. Detalle en [ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md).
