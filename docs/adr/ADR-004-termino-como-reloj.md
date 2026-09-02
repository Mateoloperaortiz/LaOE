# ADR-004: El término académico es el reloj universal

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-005, ADR-007, ADR-008

## Contexto

La OE opera por semestres: cambian comités, cargos, cohortes y rankings. GHPOINTS usa `Season` con un estado `ACTIVE` manual y un unique parcial para que solo haya una; si nadie la abre, los check-ins fallan.

## Decisión

`Term` (`2026-1`, `2026-2`) tiene `startsOn` y `endsOn`; el término actual se **deriva de la fecha**, sin bandera de activo. `pointsClosedAt` congela el ledger del término y no se reabre. Comités, puntos, asambleas, cohortes y rankings se agrupan por término.

## Consecuencias

- No se puede "olvidar abrir la temporada"; sí hay que crear los términos con antelación: el cron `reminders` avisa 30 días antes de que termine el vigente si no existe el siguiente.
- Un check-in fuera de todo término se rechaza con un mensaje claro.
- Los rankings del término cerrado quedan congelados en `TermStanding`.
