# ADR-005: Pertenencia a comité por término

- Estado: Aceptada (enmendada por ADR-039)
- Fecha: 2026-09-02
- Relacionadas: ADR-004, ADR-009

## Contexto

GHPOINTS guarda `joinedAt` y `leftAt` por pertenencia y compara timestamps al acreditar. Funciona, pero es difícil de explicar y de auditar, y no coincide con cómo la OE piensa: "en 2026-2 estuve en GEMIS y PIXEL".

## Decisión

`CommitteeMembership` es única por (persona, comité, término), con `joinedAt` y `leftAt` opcionales para cambios a mitad de semestre. Un miembro activo tiene entre 1 y 3 pertenencias activas en el término actual (tope en `AppConfig`). El crédito de una ocasión usa las pertenencias del término de la ocasión, respetando `leftAt` cuando existe.

## Consecuencias

- "Perteneció a" se lee directo de la tabla.
- Al cambiar de término, un asistente propone copiar las pertenencias vigentes al nuevo término y GH confirma; no es automático.
- Cambiar de comité el semestre siguiente no reescribe el pasado.

## Enmienda (2026-09-06, ADR-039)

La cuenta real del primer ADMIN puede arrancar temporalmente sin pertenencias a comités mediante el bootstrap de ADR-039. Es una excepción puntual para cargar política y roster; no cambia la regla de 1 a 3 comités de las altas e importaciones normales. Ver [ADR-039](ADR-039-arranque-limpio-fase-7.md).
