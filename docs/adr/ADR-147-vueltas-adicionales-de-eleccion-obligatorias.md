# ADR-147: Vueltas adicionales de elección, todas obligatorias

- Estado: Aceptada
- Fecha: 2026-10-26
- Relacionadas: ADR-024, ADR-060, ADR-129, ADR-137
- Enmienda: ADR-028 (regla 2: todas las vueltas de elección son obligatorias), ADR-035 (reglas 2 y 12: varias ocasiones `RUNOFF` por término y cumplimiento de cada una) y ADR-063 (regla 3: importación de varias vueltas)

## Contexto

Mateo aclaró que la elección puede necesitar más vueltas hasta escoger la junta directiva completa, y que todas son obligatorias. El modelo llamaba «Segunda vuelta» a `RUNOFF` y permitía una sola ocasión de ese tipo no cancelada por término. Esa restricción también estaba en la importación de asambleas y bloqueaba registrar una nueva vuelta.

La obligación corresponde a cada asamblea convocada. Asistir a una vuelta no demuestra haber asistido a otra, y una excusa aceptada justifica únicamente la ocasión para la que se presentó.

## Decisión

1. **Cada vuelta adicional es una ocasión independiente.** `RUNOFF` se muestra como «Vuelta adicional» y admite tantas ocasiones como sean necesarias en el mismo término. Se retira su unicidad por término; `BOARD_ELECTION` conserva una sola elección de junta no cancelada por término. No se crean nuevos tipos para la tercera, cuarta o siguientes vueltas.
2. **Todas las vueltas adicionales no canceladas son obligatorias.** El requisito por defecto incluye cada ocasión `RUNOFF` del término. La elección y las vueltas se exigen por su existencia en cualquier semestre, conservando ADR-060. Una vuelta posterior no sustituye una anterior. Las ordinarias conservan su requisito y el criterio de permanencia del 10 % sigue pidiendo tres asistencias completas.
3. **El cumplimiento se comprueba por ocasión.** Cada vuelta exigida requiere su asistencia completa aprobada o su excusa aceptada. Una parcial sin excusa aceptada no cumple. Una asistencia o excusa de otra vuelta no la cubre. Los totales de obligatorias incluyen cada vuelta exigida, y las firmadas cuentan por separado cada asistencia completa aprobada, sin contar las excusas como firmadas. Se conserva la cuenta compartida de ADR-129 para las superficies de participación y permanencia.
4. **El ajuste individual abarca todas las vueltas.** `requiresRunoff` conserva su forma booleana: `true` exige todas las vueltas adicionales no canceladas del término y `false` exime de todas ellas a esa persona. Un ajuste explícito en `true` sin ninguna vuelta cargada conserva una pendiente, como antes. El ajuste mantiene ADMIN, motivo y auditoría; no elige una vuelta concreta ni convierte la asistencia a una en cumplimiento de las demás.
5. **La importación permite varias vueltas.** Un lote puede incluir varias ocasiones `RUNOFF` independientes. Se elimina el rechazo por tener el mismo tipo de asamblea dentro del término; se conservan la conciliación de una ocasión existente en la misma fecha, la coincidencia de metadatos al reutilizar, la deduplicación por persona y ocasión, y las barreras del cierre de permanencia.
6. **La historia cerrada conserva su foto.** Las fotos guardadas de permanencia de términos cerrados no se reinterpretan con el calendario actual ni se les inventan vueltas. Los campos de conteo se agregan como opcionales: una foto anterior sin ellos conserva el significado de una vuelta exigida o firmada según sus booleanos. Participación deriva `requiredRunoffs` y `runoffAttendedCount`; las nuevas fotos de permanencia conservan esas cantidades en `mandatory.required.runoffCount` y `mandatory.attended.runoffCount`, para que dos vueltas no se reduzcan a una.
7. **La convocatoria sigue en manos de la OE.** La app permite registrar las vueltas que se convoquen hasta completar la junta. No determina ganadores, no infiere que la junta esté completa a partir de los cargos y no crea automáticamente la siguiente vuelta. Votación y quórum mantienen el alcance de ADR-060.

## Consecuencias

La corrección requiere retirar el índice único de `RUNOFF`, además de la validación de creación, edición e importación. Las lecturas de asambleas y permanencia deben comparar las ocasiones exigidas con los registros de cada una: un booleano que indique haber asistido a alguna vuelta ya no basta para declarar el cumplimiento de todas.

La interfaz usa «Vuelta adicional» en los tipos y «Vueltas adicionales» en el cumplimiento. La mesa de asambleas muestra vueltas firmadas / requeridas; su CSV usa los conteos `vueltas_requeridas` y `vueltas_firmadas` en lugar de los booleanos de segunda vuelta. El ajuste individual dice «Debe firmar todas las vueltas adicionales». Los identificadores `RUNOFF` y `requiresRunoff` se conservan para mantener los contratos existentes. La política de borradores con fecha pasada, registrada como decisión abierta 23, queda fuera de esta corrección.

## Verificación local

- Crear y editar varias vueltas adicionales en el mismo término, conservando el rechazo de una elección de junta duplicada.
- Comprobar que faltar a una vuelta sigue siendo incumplimiento aunque se asista a otra; una excusa solo cubre la suya y una parcial sin excusa no acredita asistencia.
- Verificar cancelaciones, ajustes individuales y el total de obligatorias y firmadas en participación, permanencia y sus exportes.
- Importar varias vueltas con conciliación e idempotencia, y conservar las fotos de términos cerrados y el significado de los snapshots anteriores.

Las regresiones reprodujeron el error «Este semestre ya tiene una Segunda vuelta» al crear otra `RUNOFF` y el conteo de tres vueltas como una. Tras la corrección, `npm run check` pasó completo: lint, tipos, dependencias, deadcode, 2.684 pruebas unitarias, 11 del extractor, 2.054 de integración y compilación de producción. La migración `0061` se aplicó en las bases locales de integración y `copy:sync` regeneró los textos. La publicación sigue pendiente.
