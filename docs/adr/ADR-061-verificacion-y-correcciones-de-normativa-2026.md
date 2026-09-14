# ADR-061: Verificación y correcciones de normativa 2026

- Estado: Aceptada (2026-09-14)
- Fecha: 2026-09-14
- Enmienda: ADR-060 (reglas 5, 6, 8, 10–13; implementación y evidencia)
- Relacionadas: ADR-052, ADR-054, ADR-059

## Contexto

La revisión de la PR #23 encontró tres pruebas E2E desactualizadas y guardas incompletas al contrastar la implementación con el documento de revisión normativa. Mateo pidió resolver los fallos, comprobar la lista completa y promover al final, cuando las verificaciones fueran satisfactorias.

## Decisión

1. Una excusa fuera de plazo exige pedir revisión excepcional y solo ADMIN puede aprobarla, con motivo auditado; la dirección del comité no puede aprobar la excepción. Una asamblea con excusa aprobada satisface la obligación, sin contarse como asistencia efectiva ni conceder puntos. La inducción de nuevos sigue pendiente aunque todavía no exista una ocasión programada.
2. La inhabilidad vigente también impide nombramientos de junta. Los nombramientos cruzados por persona se serializan dentro de la transacción. Los meses y años de suspensión/licencia respetan el último día del mes; una sanción futura no tiene efectos antes de su inicio. Prueba por comité o suspensión bloquean reconocimientos, avales, paso a honorario y horario preferencial.
3. El comité en prueba exige fechas entre seis y doce meses desde el inicio. Ampliar más allá de seis meses exige motivo auditado; no se reinicia la fecha para eludir el máximo. La reactivación pasa por prueba, después de dos meses de desactivación; pasar de prueba a activo espera el vencimiento registrado.
4. Al salir a licencia, `membership.leaveCondition` conserva la condición de ese momento, por comité y general. Al regresar, `membership_term.resumedNew` y `resumedTransfer` conservan nuevo y transferencia; también se restauran prueba y la excepción de reportar como activo. El ingreso histórico (`firstTermId`) no cambia. Una decisión explícita del término de regreso tiene precedencia. Las licencias anteriores se reconstruyen desde la fecha del último evento de salida, si existe; la ausencia de historial requiere revisión de GH. Las migraciones 0026–0027 son aditivas.
5. El traslado exige un aval aprobado del mismo comité y presupuesto, del mismo año, con evento posterior al día del traslado. Los gastos vinculados a un evento no pueden preceder a la aprobación de su aval. La Presidencia no aprueba avales después del evento. Las presolicitudes y los gastos corresponden al año presupuestado. Los gastos operativos ajenos a eventos conservan el campo de aval opcional; los traslados no.
6. La elegibilidad a honorario sigue siendo informativa: conserva semestres históricos completados aunque luego se cierre la pertenencia y muestra el impedimento por prueba/suspensión. Las aproximaciones de cargo completo de ADR-060 siguen visibles. La condición de reportar como activo en un comité no modifica la del otro.
7. El recorrido financiero se verifica en navegador; las reglas y rechazos, con pruebas de dominio e integración. El CI completo de `main`, el despliegue y las pruebas de humo de staging deben corresponder al mismo SHA que se promueva a `production`.

## Consecuencias

La [matriz de verificación](../19-verificacion-normativa-2026.md) relaciona los conflictos y vacíos con sus pruebas. Se mantienen las decisiones humanas de ADR-060: cierre y expulsión confirmados, desactivación, elección de cargos y concesión del honorario. La verificación técnica no acredita datos académicos ni decisiones de la OE que todavía no estén registrados.
