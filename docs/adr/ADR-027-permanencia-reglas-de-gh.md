# ADR-027: Permanencia: reglas confirmadas por Gestión Humana

- Estado: Aceptada (enmendada por ADR-028)
- Fecha: 2026-09-02
- Enmienda: ADR-024 (asambleas), ADR-025 (umbral y estados), ADR-026 (presupuestos, comité principal y evaluadores)

## Contexto

Miguel Gaviria, GH principal, respondió el 2026-09-02 las preguntas sobre las tablas de permanencia. Tres respuestas cambian el modelo: no existe un total único por persona sino un resultado por cada comité; los umbrales dependen de la condición de la persona y hay periodo de prueba; y quien evalúa el desempeño es el director de GH de cada frente, no el líder del grupo.

## Decisión

1. **Dos tablas con valor nominal, no presupuesto exacto.** La general vale unos 50 puntos y la de cada comité unos 60; la suma ronda 110 a 115. `Term.permanenceGeneralNominal = 50` y `Term.permanenceCommitteeNominal = 60` sirven para avisar en el editor cuando una tabla se aleja, sin bloquear. Los umbrales son puntos sobre la suma.
2. **Resultado por comité.** Para cada comité de la persona, total = parte general + parte de ese comité. Desaparecen `CommitteeMembership.isPrimary` y `permanence.committeeAggregation`. La permanencia se evalúa por comité con ese total.
3. **Umbrales fijos por condición:** vigente 60; nuevo o en periodo de prueba 80; transferencia interna a un comité 70 en ese comité. Se guardan como `permanence.threshold.*` para no repetir números en el código, pero GH los declaró fijos.
4. **Periodo de prueba.** Quien cierra hasta 10 puntos por debajo de su umbral (`permanence.probationMargin = 10`) pasa a prueba el término siguiente (`MembershipTerm.probation`), con umbral 80. Qué pasa más abajo queda por confirmar; mientras tanto la app lo marca `NO_CUMPLE` y GH decide.
5. **Cierre asistido.** La app propone el estado por persona y comité; ADMIN confirma o corrige con motivo (`PermanenceDecision`: `CONTINUES`, `PROBATION`, `EXIT_COMMITTEE`, `EXIT_OE`). Nada se aplica sin confirmación.
6. **GT por cantidad:** uno 4 %, dos 6 %, tres o más 8 % (`GROUP_EVALUATED` con tramos por cantidad).
7. **Asambleas:** obligatorias dos (una ordinaria más la elección de junta); el criterio de 10 % exige tres asambleas. `AssemblyRequirement` refleja las obligatorias; el criterio usa `CHECKIN_THRESHOLD` con mínimo 3 contando ordinarias, elección y segunda vuelta. El primer semestre, sin elección, está por confirmar (propuesta: dos ordinarias obligatorias y tres para el 10 %).
8. **Evaluadores.** Cada grupo tiene `evaluatorPersonId`: el director de GH de ese frente (cargo `GH_DIRECTOR`); las tareas de nuevos las evalúa el GH principal (cargo `GH_HEAD`). El líder del grupo lo opera; el director lo evalúa. Momento de la evaluación por confirmar (propuesta: al cerrar el evento).
9. **Comités de trabajo sembrados** con sigla, nombre y cargo que los lidera: CAP (Presidente), CGH (Vicepresidente de Gestión Humana), CCM y CAE (Vicepresidencia de Relaciones Públicas), CML (Vicepresidencia Administrativa), CAF (Vicepresidencia Financiera), Athletic (por confirmar). `Appointment.kind` incorpora los cargos de junta y de GH.
10. **Eventos del comité:** peso definido por cada comité; contenido pendiente.
11. **GH Points:** los puntos los define GH al crear cada actividad; las reuniones de comité tienen 0 puntos fijos.

## Consecuencias

- El snapshot guarda la parte general y una entrada por comité con total, umbral aplicable y estado.
- Aparecen `MembershipTerm` (condición por término: prueba) y `CommitteeMembership.transferredIn`.
- Los directores de GH necesitan una vista propia de evaluación; los líderes de comité siguen con tabla, reuniones y puntajes.
- Quedan abiertas: consecuencia más de 10 puntos por debajo, cumplir en un comité y no en otro, faltar a una obligatoria, obligatorias del primer semestre, momento de evaluar, líder y evaluador del Athletic.

## Enmienda (2026-09-02, ADR-028)

GH cerró esas seis preguntas: salida del comité con `NO_CUMPLE` y de la OE si no queda otro comité donde cumpla o esté en prueba; expulsión por faltar a una asamblea obligatoria; en primer semestre una sola ordinaria obligatoria; evaluación al cerrar el semestre; el Athletic lo evalúan su capitán y su DT, y la barra brava el GH de turno. `evaluatorPersonId` pasa a `WorkGroupEvaluator`. Ver [ADR-028](ADR-028-permanencia-consecuencias.md).
