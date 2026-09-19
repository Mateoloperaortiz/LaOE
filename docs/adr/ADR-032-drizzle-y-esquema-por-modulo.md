# ADR-032: Drizzle como capa de datos y esquema por módulo en TypeScript

- Estado: Aceptada (enmendada por ADR-079)
- Fecha: 2026-09-03
- Relacionadas: ADR-001, ADR-007, ADR-012, ADR-017, ADR-021
- Enmienda: ADR-001 (esquema y layout), ADR-021 (pre-deploy `db:release`)

## Contexto

La documentación asumía Prisma "en modo carpeta" (`prisma/schema/*.prisma` con migraciones SQL). Al arrancar el código, el 2026-09-03, se verificó el estado real: `prisma@latest` es 8.0.0-rc.12, un toolchain nuevo con contrato único (`contract.prisma`), migraciones en TypeScript y otra API de consultas; Prisma 7 (7.10) sigue estable pero es la línea previa, y pasar de 7 a 8 reescribe cada consulta. El diseño depende de rasgos concretos de PostgreSQL: índices únicos parciales (ADR-007 y [03-modelo-de-datos.md](../03-modelo-de-datos.md)), `FOR UPDATE SKIP LOCKED` y `pg_advisory_xact_lock` para el poller y el scheduler (ADR-012), `pg_trgm` para la paleta (ADR-017) y un esquema que cada módulo posea (ADR-001). Se compararon Drizzle 0.45, Prisma 8, Prisma 7 y Kysely.

## Decisión

- **Drizzle ORM 0.45 (línea estable) sobre `pg`.** Cada módulo declara sus tablas en `src/modules/<módulo>/schema.ts`; `drizzle.config.ts` las recoge con `schema: ['./src/modules/*/schema.ts']`, `out: './drizzle'` y `casing: 'snake_case'`. Tablas y columnas en `snake_case` en SQL y `camelCase` en TypeScript.
- **Restricciones en el esquema.** Los índices únicos parciales y los `CHECK` se declaran junto a la tabla (`uniqueIndex(...).on(...).where(sql\`...\`)`, `check(...)`) y salen en la migración SQL que genera `drizzle-kit generate`. La extensión `pg_trgm` y sus índices GIN van en una migración custom (`drizzle-kit generate --custom`). Las migraciones son SQL versionado en `drizzle/` y se revisan antes de commitear.
- **`db:release`** ejecuta `scripts/db-release.ts`: aplica las migraciones pendientes con `migrate()` de `drizzle-orm/node-postgres/migrator` y verifica que existan los índices parciales y la extensión; nunca hace seed. `drizzle-kit` solo genera; no corre en producción.
- **Consultas.** Se usa el query builder (`select`, `insert`, `update`, `db.transaction`) y `sql` para lo que el builder no cubre (locks, trgm). No se usan las consultas relacionales v1 ni las API marcadas para retiro en 1.0 (`.array().array()`, `getTableColumns`, `enableRLS`), para que el salto a Drizzle 1.0 sea un cambio de versión y no una reescritura.
- **Convenciones de columnas.** Ids `cuid2` generados en la app; `public_id` con `nanoid` solo donde va a URL o QR; `timestamp with time zone` en UTC; `date` para términos; JSON validado con Zod al leer.

## Consecuencias

- El módulo es dueño físico de su esquema: la frontera se revisa en el archivo y la vigila `dependency-cruiser`.
- Las restricciones "que no negocia el esquema" viven junto a las tablas y se ven en el SQL de la migración; no hay script aparte.
- Drizzle 1.0 (hoy en rc) cambia el formato de la carpeta de migraciones y las relaciones; el costo de subir queda acotado por las reglas de "Consultas".
- Donde una ADR anterior dice "Prisma" (ADR-017, ADR-018) se lee "la capa de datos"; su regla no cambia.

## Frente a las alternativas (2026-09-03)

| Opción | Esquema por módulo | Uniques parciales y locks | Estado | Veredicto |
| --- | --- | --- | --- | --- |
| Drizzle 0.45 | Nativo en TypeScript | En el esquema y en el builder | Estable; 1.0 en rc | **Elegida** |
| Prisma 8 (rc.12, el de GHPOINTS) | Contrato único | Script aparte; `$queryRaw` | RC etiquetado `latest` | Descartada: la API sigue en movimiento |
| Prisma 7 (7.10) | Carpeta `prisma/schema/` | SQL a mano; `$queryRaw` | Línea previa | Descartada: obliga a reescribir al pasar a 8 |
| Kysely 0.29 | Sin esquema; tipos por introspección | SQL tipado | Estable | Descartada: el esquema no sería la fuente de verdad |

## Enmienda (2026-09-19, ADR-079)

`db:release` ya no verifica una lista escrita a mano. Exige todo índice único y todo índice GIN que declaren los `schema.ts` de los módulos, leídos del propio esquema, más los tres GIN de `pg_trgm` de la migración custom. Una migración nueva no toca `scripts/lib/release.ts`. Las migraciones corren sin límite por sentencia. Detalle en [ADR-079](ADR-079-limites-de-espera-y-esquema-verificado-desde-el-esquema.md).
