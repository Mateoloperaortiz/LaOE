# ADR-162: Grupo de decoración en Mi OE

- Estado: Aceptada
- Fecha: 2026-11-12
- Relacionadas: ADR-036, ADR-062, ADR-084, ADR-110

## Contexto

GH puede evaluar la integración de nuevos con los miembros de un grupo ya creado. Una evaluación de buen desempeño en cualquier tarea de nuevos completaba el paso de Decoración de oficina en Mi OE, incluso cuando la tabla general acreditaba solamente Integración de nuevos.

## Decisión

Al procesar una evaluación de buen desempeño, CRM consulta a Permanencia para identificar el grupo de Decoración de oficina en el semestre del evento. Se usa el código del criterio general `decoracion-de-oficina` cuando está configurado como Grupo evaluado de tipo Tarea de nuevos con un código. En ausencia de ese código, se usa `DECORACION`, que ya identifica la evidencia importada de esta actividad en ADR-062. La consulta usa el identificador del grupo del evento y verifica su tipo y semestre. También funciona con eventos que ya estaban pendientes en el outbox.

## Consecuencias

GH puede vincular el criterio de Integración de nuevos al código `INT-NUEVOS` en modo Fijo y con peso 5. Las evaluaciones existentes entran en el cálculo al guardar la regla. Para acotar el puntaje de Decoración de oficina a su grupo, GH pone el código de ese grupo en su propio criterio.

Un grupo de decoración sin código necesita recibir `DECORACION` o el código fijado en la regla para completar el paso automáticamente. Las marcas guardadas anteriormente se conservan. El registro actual de progreso guarda la fecha de finalización y carece del identificador del grupo que la originó.
