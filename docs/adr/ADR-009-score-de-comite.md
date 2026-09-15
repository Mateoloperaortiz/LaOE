# ADR-009: Score de comité por participación relativa

- Estado: Aceptada (enmendada por ADR-024, ADR-035 y ADR-070)
- Fecha: 2026-09-02
- Relacionadas: ADR-005, ADR-006, ADR-012, ADR-024

## Contexto

Un comité grande no debe ganar por volumen bruto. El cálculo toca filas compartidas y recibe ráfagas de cientos de check-ins en segundos.

## Decisión

Por ocasión: `rate = presentes / elegibles`, donde elegibles son los activos con pertenencia al comité en el término de la ocasión y presentes son sus check-ins `APPROVED`. Una persona multicomité cuenta 1,0 en cada comité. El score del término es el promedio simple de las tasas de las ocasiones `CLOSED` con puntos. Se guarda un snapshot `CommitteeParticipation` con numerador, denominador y tasa; el denominador se congela al cerrar la ocasión. El recálculo lo hace un handler de outbox con `dedupeKey = occasionId` y `pg_advisory_xact_lock`, nunca dentro de la transacción del check-in.

## Consecuencias

- Eventualmente consistente respecto al check-in (segundos).
- La fórmula puede cambiar sin tocar el ledger individual porque el snapshot guarda los insumos.
- N funciones concurrentes colapsan en un solo cálculo por ocasión.

## Enmienda (2026-09-02, ADR-024)

El ranking usa la tasa **suavizada** `(presentes + k·μ) / (elegibles + k)`, con `k = 5` y `μ` la tasa media de la ocasión entre todos los comités, para que un comité de tres personas no salte a 100 % con un solo evento. La tasa cruda se guarda y se muestra al lado. Ver [ADR-024](ADR-024-reglas-de-participacion.md).

## Enmienda (2026-09-03, ADR-035)

El handler abre su propia transacción (los handlers del outbox no corren dentro de la del poller) y lee los elegibles antes de tomar el advisory lock; solo escribe filas para comités con elegibles; al cerrar la ocasión el denominador queda congelado y las aprobaciones posteriores solo actualizan los presentes. Ver [ADR-035](ADR-035-participacion-y-gh-points-fase-3.md).

## Enmienda (2026-09-15, ADR-070)

En Mi OE, el ranking presenta los tres primeros puestos como podio y conserva dos decimales del porcentaje ajustado. La tasa sin ajustar queda disponible en el detalle de cada comité. La fórmula permanece igual. Ver [ADR-070](ADR-070-podio-de-comites-en-gh-points.md).
