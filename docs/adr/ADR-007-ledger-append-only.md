# ADR-007: Ledger append-only por término

- Estado: Aceptada (enmendada por ADR-041, ADR-078 y ADR-088, ADR-131 y ADR-134)
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

## Enmienda (2026-09-07, ADR-041)

El tipo WORDLE acredita de 1 a 6 puntos junto a la victoria de la partida, con `wordleGameId` único. Los históricos siguen LEGACY y las correcciones del Wordle usan ajustes administrativos con motivo. Las escrituras de puntos y el cierre se coordinan dentro de la transacción mediante la fila del término. Ver [ADR-041](ADR-041-wordle-diario-y-cierre-de-puntos.md).

## Enmienda (2026-09-19, ADR-078)

El tipo SUDOKU acredita 2, 4 o 6 puntos según la dificultad del tablero, o la mitad si la partida se jugó con ayudas, junto al primer Sudoku resuelto del día y con `sudokuRunId` único. Es hermano de WORDLE y de GAME2048 (ADR-075): una entrada por partida, check de 1 a 6 y correcciones por ajuste administrativo con motivo. Ver [ADR-078](ADR-078-sudoku-con-solucion-en-el-servidor.md).

## Enmienda (2026-09-23, ADR-088)

El tipo `PANAL` acredita exactamente 6 GH Points una vez por persona y día al alcanzar Genio en el panal diario. La entrada referencia `panal_game_id` con índice único; las restricciones vinculan tipo, partida y premio. Se conserva el ledger append-only y las correcciones siguen por ajuste administrativo con motivo. Ver [ADR-088](ADR-088-panal-diario-en-espanol.md).

## Enmienda (2026-10-14, ADR-131)

El ledger sigue siendo append-only, pero su suma completa deja de representar el saldo de GH Points. La proyección GH excluye los créditos de los cuatro videojuegos y las reversiones de esas entradas; la historia de juegos se conserva y alimenta la competencia Más gamer por participaciones válidas deduplicadas. Los legados conservan su clasificación por origen identificable. Ver [ADR-131](ADR-131-gh-points-y-mas-gamer-con-rachas-separadas.md).

## Enmienda (2026-10-15, ADR-134)

El origen nativo `COLOR` acredita de uno a seis puntos gamer al completar la primera partida válida del día, ligado a su partida con procedencia única. Sus entradas y reversiones siguen append-only y el bloqueo de término; no aportan GH Points. No se convierte ni recorta historia LEGACY. Ver [ADR-134](ADR-134-juegos-protagonista-y-color.md).
