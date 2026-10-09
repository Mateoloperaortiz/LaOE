# ADR-004: El término académico es el reloj universal

- Estado: Aceptada (enmendada por ADR-118)
- Fecha: 2026-09-02
- Relacionadas: ADR-005, ADR-007, ADR-008

## Contexto

La OE opera por semestres: cambian comités, cargos, cohortes y rankings. GHPOINTS usa `Season` con un estado `ACTIVE` manual y un unique parcial para que solo haya una; si nadie la abre, los check-ins fallan.

## Decisión

`Term` (`2026-1`, `2026-2`) tiene `startsOn` y `endsOn`; el término actual se **deriva de la fecha**, sin bandera de activo. `pointsClosedAt` congela el ledger del término y no se reabre. Comités, puntos, asambleas, cohortes y rankings se agrupan por término.

## Consecuencias

- No se puede "olvidar abrir la temporada"; sí hay que crear los términos con antelación: el job programado `reminders` avisa 30 días antes de que termine el vigente si no existe el siguiente.
- Un check-in fuera de todo término se rechaza con un mensaje claro.
- Los rankings del término cerrado quedan congelados en `TermStanding`.

## Enmienda (2026-10-08, ADR-118)

Decisión: «el término actual se deriva de la fecha» supone que una fecha cae en un solo término, y nada lo garantizaba: se podían crear y editar términos con fechas solapadas, y la búsqueda del término de una fecha tomaba el primero. Ahora crear y editar un término rechazan las fechas que comparten algún día con otro (T-3254), y lo comprueban bajo un candado del calendario para que dos altas a la vez no pasen las dos. Los huecos entre términos se siguen admitiendo (decisión abierta 27). Ver [ADR-118](ADR-118-reglas-de-correccion-del-sexto-ciclo.md) regla 26.
