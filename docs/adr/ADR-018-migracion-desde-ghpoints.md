# ADR-018: Migración desde GHPOINTS por script sobre dump

- Estado: Aceptada (enmendada por ADR-034)
- Fecha: 2026-09-02
- Relacionadas: ADR-006, ADR-007, ADR-019

## Contexto

GHPOINTS tiene roster, ledger, asistencias, asambleas, ediciones y QR impresos en circulación. La app nueva cambia el modelo (persona, término, ocasión) y debe heredar la historia sin perder un punto.

## Decisión

`scripts/migrate-ghpoints.ts` lee con `pg` una restauración local del dump de Railway y escribe con Prisma contra la base nueva en Railway, de forma idempotente por id de origen. `scripts/verify-migration.ts` compara conteos por tabla y `SUM(points)` por persona y término; cero diferencias es condición de cutover. `LegacyAlias` conserva `/a/{publicId}` y `/asamblea/{publicId}` apuntando a la ocasión nueva. Nunca se corre contra la base viva de producción. El mapeo completo está en [../08-migracion-ghpoints.md](../08-migracion-ghpoints.md).

## Consecuencias

- Ensayos repetibles antes del cutover; delta final con la app vieja congelada.
- Los tipos que no existen en el modelo nuevo (`FLASH`, `BOOST`, `WORDLE`) se conservan como `LEGACY` con su motivo original.

## Enmienda (2026-09-03, ADR-034)

Donde dice Prisma se lee Drizzle (ADR-032). El script lee desde `GHPOINTS_DATABASE_URL` (una restauración local del dump) en una sesión de solo lectura y se ensaya por fases: la fase 2 migra términos, comités, personas, membresías, pertenencias y permisos (`MemberRole COMMITTEE_LEADER` → permiso con comité más `roleCode = GENERAL` en la pertenencia del término actual; el cargo visible de líder no es un `Appointment`); la fase 3 agrega ocasiones, check-ins, ledger y asambleas. Ver [ADR-034](ADR-034-personas-y-mi-oe-fase-2.md).
