# ADR-028: Permanencia: consecuencias, asambleas obligatorias y evaluación al cierre

- Estado: Aceptada (enmendada por ADR-036 y ADR-147)
- Fecha: 2026-09-02
- Enmienda: ADR-024 (asambleas) y ADR-027 (puntos 4, 7 y 8)

## Contexto

Miguel Gaviria, GH principal, respondió el 2026-09-02 las siete preguntas que quedaban sobre permanencia: qué pasa fuera del margen de prueba, qué pasa con quien cumple en un comité y no en otro, la consecuencia de faltar a una asamblea obligatoria, las obligatorias del primer semestre, el momento de la evaluación y cómo funciona el Athletic.

## Decisión

1. **Consecuencia por comité.** Al cerrar el término, para cada comité de la persona: total ≥ umbral → `CONTINUES`; hasta 10 puntos por debajo → `PROBATION`; más de 10 por debajo → `NO_CUMPLE`. Con `NO_CUMPLE` en un comité, la persona **sale de ese comité** (`EXIT_COMMITTEE`); si no le queda ningún comité donde esté en `CONTINUES` o `PROBATION`, **sale de la OE** (`EXIT_OE`). La app propone y GH confirma con motivo.
2. **Asambleas obligatorias.** Primer semestre: una ordinaria. Segundo semestre: una ordinaria más la elección de junta, y la segunda vuelta si la hay. **Faltar a una obligatoria implica expulsión de la OE**: la app lo propone como `EXIT_OE` en el cierre y avisa a cada persona antes de cada obligatoria con ese texto. El criterio de permanencia del 10 % exige **tres asistencias** en el término en ambos semestres (obligatorias más extras). `assemblies.requiredOrdinary = 1`, `permanence.assembliesForCredit = 3`.
3. **Momento de la evaluación.** Los directores de GH evalúan al cerrar el semestre. La app abre la ventana de evaluación dos semanas antes del cierre del término y recuerda los pendientes; lo no evaluado al cierre cuenta como no logrado salvo que GH lo resuelva.
4. **Athletic.** Para el 6 % de comité de trabajo, el Athletic lo manejan un capitán y un DT, que reportan quién jugó y quién no: ambos son evaluadores del grupo. Para el 5 % de barra brava evalúa el GH de turno, con las asistencias a partidos como evidencia principal (regla `COMPOSITE`: tres partidos más evaluación). Un grupo puede tener varios evaluadores (`WorkGroupEvaluator`).
5. **Directores por frente y tablas de comités.** GH las envía cuando termine de limpiar su base; contenido pendiente, no decisión.

## Consecuencias

- `WorkGroup.evaluatorPersonId` pasa a la tabla `WorkGroupEvaluator` (grupo, persona).
- El cierre calcula la propuesta con la regla del punto 1 y con `mandatoryAssembliesMet`; nada se aplica sin la confirmación de GH.
- Las obligatorias se muestran aparte del criterio del 10 %, con aviso previo y consecuencia explícita.
- No queda ninguna decisión de permanencia abierta; sigue pendiente solo el plazo de anonimización de egresados, que es de la junta.

## Enmienda (2026-09-04, ADR-036)

La ventana de evaluación se configura (`permanence.evaluationWindowDays = 14`) y rige a los evaluadores; ADMIN evalúa en cualquier momento. Las evaluaciones pendientes al aplicar el cierre cuentan como no logradas y la app lo advierte sin bloquear. Las consecuencias se ejecutan con comandos de `people` desde un job reanudable, con el actor que confirmó cada decisión. Ver [ADR-036](ADR-036-permanencia-fase-4.md).

## Enmienda (2026-10-26, ADR-147)

La regla 2 exige todas las vueltas adicionales que se convoquen hasta escoger la junta directiva completa, sin límite de cantidad por término. Cada vuelta se cumple con su propia asistencia completa o excusa aceptada; una vuelta posterior no sustituye una anterior. El criterio del 10 % conserva su mínimo de tres asistencias. Ver [ADR-147](ADR-147-vueltas-adicionales-de-eleccion-obligatorias.md).
