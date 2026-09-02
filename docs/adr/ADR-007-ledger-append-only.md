# ADR-007: Ledger append-only por término

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-004, ADR-006, ADR-018

## Contexto

Los puntos son el activo más sensible de GH: cualquier edición silenciosa destruye la confianza. GHPOINTS ya validó que un ledger inmutable con reversiones funciona.

## Decisión

`PointEntry` nunca se edita ni se borra. Invariante: un check-in `APPROVED` tiene exactamente una entrada `CHECKIN` viva (unique parcial por `checkInId`); cualquier otro estado equivale a neto cero mediante una entrada `REVERSAL` con `reversalOfId` único. Los ajustes manuales exigen motivo y actor. El saldo es `SUM(points)` por persona y término; nunca se persiste. Tras `pointsClosedAt` el término no acepta entradas nuevas.

## Consecuencias

- Auditoría completa y reproducible; los rankings son consultas.
- La migración conserva los importes históricos de GHPOINTS como `LEGACY` con su motivo original.
- Un error se corrige con una reversión y, si hace falta, un ajuste; nunca con `UPDATE`.
