# ADR-001: Monolito modular sobre serverless con un solo Postgres

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-012, ADR-017, ADR-019

## Contexto

Una sola persona mantiene el sistema, el presupuesto es de unos US$20 al mes y el principio rector es "un solo lugar". Vercel no ofrece procesos permanentes. El dominio tiene muchas áreas (personas, participación, contenido, formularios, comunicaciones) que crecerían desordenadas si se organizan solo por tipo técnico.

## Decisión

Una aplicación Next.js (App Router) organizada por **módulos de dominio** en `src/modules/*`. Cada módulo es dueño de su esquema, sus comandos, sus lecturas, sus acciones, sus jobs y sus componentes. Los módulos no se importan por dentro: exponen lecturas explícitas y publican eventos de dominio. Un único PostgreSQL (Neon) guarda datos, outbox, sesiones, rate limit y búsqueda (`pg_trgm`). No hay Redis, colas de terceros ni worker permanente. Vercel Queues o Workflows solo se adoptarían si el outbox se queda corto con uso medido.

## Consecuencias

- Un repositorio, un despliegue, un esquema; el módulo es la unidad de orden y de revisión.
- Las fronteras entre módulos se cuidan con una regla de lint de imports, no con procesos separados.
- Los cálculos de fondo deben ser cortos e idempotentes porque corren dentro de funciones.

## Frente a GHPOINTS

GHPOINTS también es un monolito, pero organizado por capas (`actions`, `domain`, `components`) y con efectos derivados coalescidos por instancia de proceso. Aquí la organización es por módulo y la coordinación pasa por Postgres.
