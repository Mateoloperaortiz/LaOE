# ADR-026: Permanencia en dos niveles: la OE y el comité

- Estado: Aceptada (enmendada por ADR-027)
- Fecha: 2026-09-02
- Enmienda: ADR-025
- Relacionadas: ADR-005, ADR-006, ADR-011, ADR-014

## Contexto

Además de la tabla de Gestión Humana, cada uno de los 27 comités tiene su propia tabla de permanencia. Ejemplo recibido del comité A3: asistencia a reuniones cada 8 días (15 %), dos eventos del comité (pesos por definir), pertenecer y trabajar en un subcomité, haber liderado un evento o ser miembro destacado del mes (10 %) y un criterio obligatorio de convivencia, respeto, actitud, escucha y comunicación (5 %, con observación escrita si no se cumple). Las capturas de GH suman 50 % para veteranos; la parte del comité completa el total. Un integrante pertenece a entre 1 y 3 comités.

## Decisión

1. **Dos ámbitos de reglas.** `PermanenceRule.scope` es `OE` (las define GH para toda la organización) o `COMMITTEE` (las define el líder de cada comité para su comité y término). GH fija por término un **presupuesto** para cada ámbito (`Term.permanenceOeBudget` y `Term.permanenceCommitteeBudget`, propuesta 50 % y 50 %); el editor obliga a que cada tabla sume su presupuesto y GH puede bloquear las tablas de comité al iniciar el término.
2. **Dos tipos de cálculo nuevos.** `CHECKIN_RATE`: el peso multiplicado por la tasa de asistencia a las ocasiones de una categoría (reuniones de comité). `LEADER_SCORE`: el líder asigna un valor entre 0 y el peso; si es menor al peso, la observación es obligatoria; en criterios marcados como obligatorios (convivencia) el valor por defecto es el peso completo.
3. **Las reuniones de comité son ocasiones** con categoría `COMMITTEE_MEETING`, sin puntos por defecto, creadas en serie semanal por el líder y con asistencia por modo anfitrión. Los eventos del comité son ocasiones con `committeeId` y sus propias reglas.
4. **Comité principal.** `CommitteeMembership.isPrimary` marca un comité principal por persona y término (unique parcial). La parte de comité del total de la persona usa el comité principal (`permanence.committeeAggregation = PRIMARY`; `AVERAGE` y `MAX` quedan disponibles si GH prefiere otra cosa). Las tablas de los demás comités de la persona se calculan y se muestran igual, y cada comité ve el resultado de sus integrantes.
5. **Total y umbral.** Total de la persona = parte OE + parte de comité; el umbral del 60 % aplica al total. Si un comité usa además su propio resultado para decidir la permanencia dentro del comité, es una decisión del comité registrada como interacción; no cambia la membresía en la OE.
6. **Observaciones visibles.** Las observaciones del líder (por ejemplo, convivencia) las ve la persona evaluada y GH; se escriben como interacción en su línea de tiempo y se redactan con ese criterio (ADR-014).

## Consecuencias

- El líder de comité suma tres deberes: editar la tabla de su comité dentro del presupuesto, pasar asistencia en las reuniones y evaluar a sus integrantes; la app le muestra lo pendiente.
- GH supervisa 27 tablas en vez de una: vista de conjunto, comentarios y bloqueo.
- Preguntas abiertas: si el presupuesto es 50/50, cómo se combina para quien está en varios comités, si los eventos 1 y 2 tienen peso fijo o lo define cada comité, y si el resultado del comité decide también la permanencia en el comité.

## Enmienda (2026-09-02, ADR-027)

GH respondió: los valores son nominales (general ≈ 50, comité ≈ 60, sin sumar 100 exacto); no hay comité principal sino un **resultado por cada comité** (general más la tabla de ese comité), así que `isPrimary` y `committeeAggregation` desaparecen; los eventos del comité los define cada comité; y quien evalúa es el director de GH del frente, no el líder del grupo. Ver [ADR-027](ADR-027-permanencia-reglas-de-gh.md).
