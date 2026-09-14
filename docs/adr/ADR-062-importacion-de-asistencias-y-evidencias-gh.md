# ADR-062: Importación histórica de asistencias y evidencias de GH

- Estado: Implementada, desplegada y carga verificada en producción
- Fecha: 2026-09-14
- Relacionadas: ADR-007, ADR-012, ADR-022, ADR-035, ADR-036, ADR-038
- Enmienda: ADR-035 (entrada administrativa de asistencias históricas), ADR-036 (evidencias previamente validadas por GH), ADR-038 (sin push para créditos importados)

## Contexto

GH entregó formularios y listas de partidos, juegos y decoración para preparar su carga. Confirmó 10, 20 y 30 GH Points por actividad, respectivamente; las personas en licencia pueden recibir estos puntos. Decoración corresponde a una sola actividad de varios días y es exclusiva de nuevos. Las capturas de la tabla coinciden con la referencia general existente: integraciones 2 puntos porcentuales por actividad hasta 10; apoyo Athletic 5 al acreditar tres encuentros; decoración 10 para nuevos.

GH confirmó expresamente que la lista de decoración acredita cumplimiento completo y que tres encuentros de los listados acreditan apoyo válido. Los originales y datos personales se conservan fuera de Git. No se debe sustituir la evidencia por ajustes de saldo.

## Decisión

1. Un CLI administrativo (`ghpoints:import`) recibe un manifiesto `oe-ghpoints/2` y un paquete local de evidencia. Por defecto solo consulta y produce una vista previa. El manifiesto identifica término por código e ID, correos, actividades, fuentes, SHA-256, filas originales, reglas propuestas y evaluación explícita `PENDING` o `GOOD`.
2. Aplicar requiere `--apply`, ADMIN vigente y el hash de la vista previa. La escritura reconsulta dentro de una transacción y bloquea temporalmente las tablas de elegibilidad, ocasiones, ledger, grupos y reglas. Un cambio relevante invalida el plan. No crea personas ni cambia membresías. Las filas desconocidas quedan retenidas; omitirlas requiere `--skip-blocked` explícito.
3. Para este camino de importación se admite `ON_LEAVE` únicamente si `allowOnLeavePoints` está activado. No altera el régimen de permanencia de personas exentas ni modifica las otras puertas de check-in. `newMembersOnly` exige primera membresía en el término.
4. Las ocasiones existentes se reutilizan con ID confirmado y metadatos compatibles. Las nuevas nacen cerradas, con clave estable por lote y actividad. Una asistencia por ocasión y persona produce un solo crédito `CHECKIN`; los créditos revertidos, estados incompatibles y posibles ajustes duplicados se retienen. Reintentar permite añadir personas que se registraron después sin repetir créditos.
5. Si la fuente solo contiene días, `datePrecision: DAY` representa el intervalo local completo en Bogotá, con fin exclusivo al día siguiente. Descripción y auditoría explicitan que los límites no son horas reales. El intervalo de decoración no multiplica asistencias ni puntos. Se conservan los horarios y el estado de las ocasiones reutilizadas.
6. El bucket privado conserva archivos verificados; `ImportJob`, auditoría por asistencia y por evidencia guardan sus vínculos. La subida es previa a la transacción SQL: un fallo posterior puede dejar objetos sin referencia, con claves deterministas que el reintento reutiliza. No se borran objetos automáticamente.
7. Evidencia `NEW_MEMBER_TASK` con código `DECORACION` y `BARRA_BRAVA` con código `APOYO-ATHLETIC`. La confirmación explícita de GH permite registrar `GOOD`; una evaluación insuficiente o una pertenencia cerrada exige conciliación, nunca se sobrescribe. El motor existente mantiene el umbral de tres partidos para Athletic. La tabla general se configura mediante reglas del manifiesto; reglas existentes diferentes o tabla bloqueada impiden aplicar.
8. Mutaciones, créditos, evaluación, reglas, auditoría e importación se guardan en una transacción. Se emiten los eventos habituales para CRM, onboarding, score y permanencia. `comms` omite el push de `checkin.approved` cuyo origen sea `IMPORT`.

## Consecuencias

No se necesita un formato distinto por cada Excel ni una migración de esquema. La carga es una operación administrativa acotada, no una nueva pantalla de autoservicio. La vista previa puede generarse sobre una consulta privada guardada; aplicar siempre requiere una consulta viva. Las tablas de comité y las decisiones de permanencia no se modifican.

Uso y verificaciones: [Importación de GH Points](../importacion-ghpoints.md).

La carga autorizada del 14/09/2026 quedó aplicada y verificada: 222 asistencias y 3.650 GH Points para 117 personas, sin retenciones ni diferencias de porcentajes. Evidencia del despliegue, integridad e idempotencia en el [runbook](../15-runbook.md#carga-histórica-de-gh-points--2026-09-14).
