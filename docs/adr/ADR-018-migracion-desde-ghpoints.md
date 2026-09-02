# ADR-018: Migración desde GHPOINTS por script sobre dump

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-006, ADR-007, ADR-019

## Contexto

GHPOINTS tiene roster, ledger, asistencias, asambleas, ediciones y QR impresos en circulación. La app nueva cambia el modelo (persona, término, ocasión) y debe heredar la historia sin perder un punto.

## Decisión

`scripts/migrate-ghpoints.ts` lee con `pg` una restauración local del dump de Railway y escribe con Prisma contra `DIRECT_URL` de Neon, de forma idempotente por id de origen. `scripts/verify-migration.ts` compara conteos por tabla y `SUM(points)` por persona y término; cero diferencias es condición de cutover. `LegacyAlias` conserva `/a/{publicId}` y `/asamblea/{publicId}` apuntando a la ocasión nueva. Nunca se corre contra la base viva de producción. El mapeo completo está en [../08-migracion-ghpoints.md](../08-migracion-ghpoints.md).

## Consecuencias

- Ensayos repetibles antes del cutover; delta final con la app vieja congelada.
- Los tipos que no existen en el modelo nuevo (`FLASH`, `BOOST`, `WORDLE`) se conservan como `LEGACY` con su motivo original.
