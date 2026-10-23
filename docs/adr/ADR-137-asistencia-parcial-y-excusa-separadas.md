# ADR-137: Asistencia parcial y excusa por separado

- Estado: Publicada en producción; carga verificada
- Fecha: 2026-10-22
- Relacionadas: ADR-006, ADR-035, ADR-060, ADR-062, ADR-063, ADR-111, ADR-119, ADR-131
- Enmienda: ADR-035 (registro, efectos y cumplimiento), ADR-060 (excusa y representación), ADR-063 (importación), ADR-111 (excusa sobre una parcial aprobada), ADR-131 (presencia completa acreditada)

## Contexto

Una asamblea obligatoria usa dos tomas de asistencia. Estar en ambas acredita asistencia completa; estar en una sola acredita asistencia parcial y requiere excusa por la parte faltante. Aprobar el registro parcial confirma ese hecho, sin convertirlo en completo. La excusa tiene su propia presentación y decisión, y aceptarla debe conservar el hecho parcial.

El modelo anterior solo guardaba la decisión del check-in. Importar una parcial como aprobada acreditaba cumplimiento completo y le cerraba el camino de solicitar excusa.

## Decisión

1. **Presencia y decisión son dimensiones distintas.** Se conserva un check-in por persona y ocasión. `attendanceExtent` es `FULL`, `PARTIAL` o nulo cuando no hay presencia registrada. Una parcial lleva `attendanceList: FIRST | SECOND`; las demás no llevan lista parcial. Solo una asamblea admite el registro parcial. No se definen fracciones de puntos ni de asistencia.
2. **Compatibilidad histórica.** Los check-ins anteriores conservan presencia completa, salvo los ya excusados, cuya presencia queda nula porque no existe evidencia de que asistieran. No se reconstruyen tomas de lista ni se reinterpretan fotos cerradas. La nueva captura ordinaria y el QR siguen registrando presencia completa.
3. **Acreditación.** Solo `APPROVED` con presencia `FULL` cuenta como asistencia completa para asambleas, permanencia, representación y efectos de participación. `APPROVED` con `PARTIAL` confirma la presencia parcial, sin acreditar el requisito ni generar puntos, premios, rachas, insignias o encuestas de asistencia completa. El hecho se audita y emite `checkin.partial`, sin el aviso de aprobación completa.
4. **Excusa independiente.** `Request.kind=EXCUSE` conserva su estado propio. Se puede presentar y aprobar sobre una parcial aprobada. Al aceptarla, el check-in pasa a `EXCUSED` y conserva presencia parcial y lista. Sin presencia anterior, nace excusado con presencia nula. Una completa aprobada sigue sin admitir excusa. Se mantienen causales, plazo y excepción tardía existentes.
5. **Cumplimiento justificado.** Una parcial sin excusa aceptada no cumple la obligación. La excusa aceptada justifica la parte faltante y satisface el requisito como excusa, sin sumar una asistencia completa ni borrar la parcial. Permanencia y representación leen la misma regla. Rechazar o retirar la solicitud no altera la evidencia de presencia.
6. **Importación compatible y revisable.** `oe-ghpoints/2` admite por participante `attendanceExtent` y referencias `attendanceEvidence` por toma, fuente verificada por hash, hoja y fila. Los manifiestos anteriores siguen representando completas. Con evidencia nueva, una completa requiere ambas tomas y una parcial exactamente una. El plan separa completas y parciales; la auditoría conserva todas las referencias. Una diferencia de presencia o lista se retiene para conciliar; un reintento equivalente conserva la excusa existente y no duplica ni convierte registros.
7. **Presentación y privacidad.** La consola, la Persona 360, el check-in del miembro y los exportes muestran asistencia y excusa por separado. Las vistas generales de excusas solo reciben estado y fecha, sin causal ni nota privada. Las páginas componen las lecturas de `participation` y `crm`; no se introduce una dependencia circular entre módulos.

## Verificación y consecuencias

Los seams acordados son registro y consulta de asistencias, presentación y decisión de excusas, plan y aplicación de importación, consola y recorrido completo del miembro. Las pruebas cubren la parcial que permanece parcial tras aceptar, rechazar o retirar la excusa; la completa que conserva su comportamiento; la exclusión de beneficios; la trazabilidad e idempotencia de lotes mixtos; y la migración de la historia excusada.

La migración agrega las dos dimensiones al registro existente. No crea otra asamblea para la segunda toma, ni registra una excusa antes de que exista y se apruebe una solicitud. La carga real se prepara y revisa mediante el flujo de importación vigente, con un plan que identifica el término y conserva las fuentes.

Implementación local verificada el 2026-10-22: `npm run check` aprobado, con 2.603 pruebas unitarias, 2.020 de integración, 11 del extractor y compilación. La regresión de navegador incluye QR, solicitudes y los recorridos de parcial ordinaria y tardía, con rechazo, corrección y aceptación; la confirmación final valida también accesibilidad y ancho móvil. La migración se aplicó en bases aisladas de pruebas (60 migraciones y 167 índices). El contrato de `checkin.partial` conserva valores futuros de lista como texto, según ADR-084; el productor valida las dos listas admitidas.

Publicada el 2026-10-22 por [PR 374](https://github.com/Mateoloperaortiz/LaOE/pull/374), con el SHA `41e8bf66ed109b9c259c7217e4881f4a170b1e17` comprobado en CI completo, staging y producción. Ambos despliegues quedaron `SUCCESS`, con smoke, 60 migraciones y 167 índices exigidos; producción conserva el poller y el scheduler nuevos y retiró todas las instancias anteriores.

La carga real del mismo día conserva una sola asamblea del 16 de octubre: 198 completas y 83 parciales (41 de la primera lista y 42 de la segunda), con 281 fichas únicas. Se conciliaron y conservaron doce check-ins anteriores mediante la transición canónica y se importaron los 269 restantes; las dos solicitudes de excusa previas permanecieron intactas y no se importó ninguna excusa. La asamblea tiene base de cero puntos; seis completas liquidaron los bonos semanales de +5 que ya establece ADR-131, auditados por separado y sin beneficio de las parciales. La verificación independiente confirmó la evidencia privada por hash, el ledger previo intacto, los eventos procesados y una nueva vista previa con 281 existentes y cero altas o conflictos. La operación y su comprobación quedan registradas en el [runbook](../15-runbook.md#asistencia-parcial-y-carga-de-la-asamblea-del-16-de-octubre-adr-137).
