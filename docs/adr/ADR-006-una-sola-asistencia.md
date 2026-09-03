# ADR-006: Una sola mecánica de asistencia

- Estado: Aceptada (enmendada por ADR-024)
- Fecha: 2026-09-02
- Relacionadas: ADR-007, ADR-009, ADR-010, ADR-024

## Contexto

GHPOINTS tiene `Attendance`, `AssemblyAttendance` y `FlashClaim` con lógica paralela: tres consolas, tres tipos de QR, tres formas de aparecer en la historia de una persona.

## Decisión

`Occasion` (`kind` `ACTIVITY`, `ASSEMBLY` o `EDITION_SESSION`; puntos; ventana de check-in; aprobación `AUTO` o `MANUAL`; código rotativo opcional) y `CheckIn` único por (ocasión, persona) con `source` `SELF_QR`, `HOST`, `ADMIN` o `IMPORT`. Los puntos son una consecuencia configurada (`points > 0`); una asamblea es una ocasión con 0 puntos que cuenta para el requisito del término. Publicar un evento, una edición o un enlace de inscripción nunca crea check-ins ni puntos.

Ciclo de la ocasión: `DRAFT → OPEN → CLOSED`; `CANCELLED` desde cualquier estado con motivo, revirtiendo créditos vivos en la misma transacción. No hay reapertura.

## Consecuencias

- Una sola consola, un solo QR (`/a/[publicId]`), una sola entrada "asistió a" en la línea de tiempo.
- El modo anfitrión (organizador marca por la persona) sirve para cualquier tipo de ocasión.
- Reto relámpago y boosters quedan fuera; su historia se conserva como `LEGACY` en el ledger.

## Enmienda (2026-09-02, ADR-024)

Las asambleas llevan `assemblyKind`: `ORDINARY` (dos obligatorias por término), `BOARD_ELECTION` (una en cada término de segundo semestre, obligatoria para toda la OE) y `RUNOFF` (segunda vuelta, obligatoria si existe). El código rotativo es opcional por ocasión y viene apagado por defecto. Ver [ADR-024](ADR-024-reglas-de-participacion.md).
