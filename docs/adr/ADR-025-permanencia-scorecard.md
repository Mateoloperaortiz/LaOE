# ADR-025: Permanencia como tablero de criterios configurable por término

- Estado: Aceptada (enmendada por ADR-026)
- Fecha: 2026-09-02
- Relacionadas: ADR-003, ADR-004, ADR-006, ADR-008, ADR-012, ADR-024, ADR-026

## Contexto

Gestión Humana decide cada semestre quién permanece en la OE con una tabla de criterios ponderados (integraciones, asambleas, grupos de trabajo de macroeventos, GAP, GAP OE, comités de trabajo, barra brava, tareas de nuevos) y un umbral del 60 %. Hoy es una hoja de cálculo: la persona no ve su avance hasta el final, la tabla cambia por término (por ejemplo, criterios propios para quienes ingresan en 2026-2) y mezcla hechos automáticos con juicios de desempeño. Mateo pidió que cada integrante vea su progreso y que el 60 % sea el criterio de permanencia.

## Decisión

1. **Las reglas viven en la base, por término** (`PermanenceRule`): criterio, peso, a quién aplica (todos, nuevos, veteranos), tipo de cálculo y parámetros. GH copia la tabla del término anterior y la ajusta. El umbral es configuración por término (`permanence.threshold`, 60 por defecto).
2. **Todo criterio se deriva de hechos registrados**: check-ins con categoría de ocasión, pertenencia a grupos de trabajo (`WorkGroup`) con una evaluación explícita de desempeño (`GOOD` o `INSUFFICIENT`) hecha por el líder del grupo o por GH, y créditos manuales auditados con motivo. "Buen desempeño" es un registro humano, nunca un cálculo.
3. **Snapshot por persona y término** (`PermanenceSnapshot`) recalculado por outbox al aprobar o revertir un check-in, cambiar una pertenencia a grupo, registrar una evaluación, cambiar una regla o cambiar la membresía. Guarda total, desglose por criterio, lo que aún es posible y el estado (`EN_CAMINO`, `EN_RIESGO`, `NO_ALCANZA`, `CUMPLE`, `NO_CUMPLE`). Se congela al cerrar el término.
4. **Nuevos y veteranos** se distinguen por regla (`appliesTo`); nuevo es quien tiene `firstTermId` igual al término (ADR-008). Los criterios de nuevos reemplazan a los que GH indique.
5. **La persona siempre ve su porcentaje**, el desglose, qué le falta y las evaluaciones pendientes; recibe avisos a mitad de término y antes del cierre.
6. **El cierre produce decisiones explícitas** por persona (`CONTINUES`, `CONTINUES_WITH_COMMITMENT`, `EXIT`) tomadas por ADMIN con motivo; `EXIT` ejecuta "dar de baja" (ADR-003). Sin sanciones automáticas.
7. **Permanencia y GH Points comparten hechos pero no se mezclan**: los puntos no suman permanencia ni al revés.

## Consecuencias

- Las ocasiones necesitan categoría al crearse (`INTEGRATION`, `ATHLETIC_MATCH`, …) y la marca "solo nuevos" cuando aplique.
- Los líderes de grupo adquieren un deber: evaluar a sus integrantes; la app les recuerda y GH ve lo pendiente.
- La tabla completa del término, con su total y quién evalúa cada grupo, es contenido que GH debe entregar; las capturas recibidas suman 50 % para veteranos y 45 % para nuevos, así que faltan criterios.
- Los seis comités de trabajo y el Athletic se modelan como grupos de trabajo, distintos de los 27 comités de pertenencia (por confirmar).

## Enmienda (2026-09-02, ADR-026)

Las reglas tienen dos ámbitos: las de la OE (GH) y las de cada comité, cada uno con un presupuesto por término; el total de la persona suma ambas partes y usa el comité principal. Las capturas de GH que sumaban 50 % no estaban incompletas: el resto lo pone el comité. Ver [ADR-026](ADR-026-permanencia-por-comite.md).
