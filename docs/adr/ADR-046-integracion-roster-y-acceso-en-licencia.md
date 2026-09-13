# ADR-046: Integración del roster y acceso de consulta en licencia

- Estado: Aceptada (enmendada por ADR-047); implementada y verificada en staging y producción. Importación de personas pendiente por política de datos.
- Fecha: 2026-09-08
- Enmienda: ADR-003, ADR-034, ADR-037 y ADR-039
- Relacionadas: ADR-014, ADR-030, ADR-032, ADR-040 y ADR-045

## Contexto

El ADMIN autorizó conservar las columnas A–L del roster real, omitir CARNE y Columna1, cargar primero las personas verificadas y completar los pendientes después. Confirmó conservar los cuatro datos personales adicionales, visibles únicamente para ADMIN y su titular, y permitir consultar Mi OE durante la licencia. La carga mantiene la vía normal de política y autorizaciones; la excepción individual de ADR-045 no se amplía.

## Decisión

1. `Person` incorpora `documentType` (CC, TI, CE, PPT), `documentNumber`, `epikId` y `birthDate`, todos opcionales. Los identificadores son texto y el nacimiento es fecha civil sin conversión horaria. El correo institucional sigue siendo la identidad de acceso y de conciliación; documentos e ID EPIK no fusionan personas automáticamente.
2. El importador reconoce las cuatro columnas y muestra sus cambios en la vista previa. Vacíos o valores opcionales inválidos conservan datos existentes; los inválidos generan advertencia. ADMIN puede corregir o borrar expresamente desde la ficha. El titular consulta y descarga los propios; los datos no se agregan a directorios, carnés ni respuestas de terceros. La anonimización limpia los cuatro campos.
3. NUEVO y JUNTA equivalen a ACTIVE; PERÍODO DE PRUEBA a ACTIVE con probation; PRÁCTICA e INTERCAMBIO a ON_LEAVE. La condición nuevo/veterano se sigue derivando del ingreso. JUNTA no crea cargos ni permisos. GRADUADO se deja pendiente de fecha o semestre de salida y no se transforma en una baja con fecha de importación.
4. ON_LEAVE puede iniciar sesión, consultar Mi OE y gestionar datos personales. La elegibilidad de acceso se separa de participación, credenciales y permisos operativos: no habilita check-in, puntos, Wordle, inscripciones, envíos de formularios de miembros, encuestas, onboarding manual ni operaciones de cargos. Los permisos y vínculos de cargos se conservan, pero se suspenden sus capacidades efectivas. Los pases Wallet existentes mantienen el tratamiento de ADR-040; no se emiten ni rotan credenciales nuevas durante la licencia. Las sesiones revocadas previamente no vuelven a valer.
5. La carga inicial usa una copia CSV privada que solo contiene A–L de la hoja consolidada. Se excluyen físicamente las otras columnas y la hoja auxiliar antes de subir el archivo al bucket. La preparación recupera los valores XML de celulares con formato de fecha incorrecto, normaliza únicamente equivalencias inequívocas y registra procedencia por fila. No modifica la fuente ni incorpora datos personales a seeds, pruebas, fixtures o Git.
6. Duplicados equivalentes se unifican; conflictos, correos no institucionales, obligatorios ausentes y graduados quedan en un informe privado para otra carga. Fechas ambiguas o incorrectas se dejan vacías con su referencia original. El estado original se conserva en el CSV. La vista previa rechaza diferencias del ingreso de una membresía existente y solo crea términos históricos requeridos por filas válidas. Comités y cargos históricos se conservan; las pertenencias del roster corresponden al término seleccionado.
7. Antes de aplicar: texto real de privacidad publicado, versión activa y respaldo de las autorizaciones de membresía. Se usa el asistente actual con step-up, respaldo previo, vista previa sin errores, transacción y auditoría. Se registran consentimientos MEMBERSHIP/IMPORT; no se emite `person.admitted` ni bienvenida. El despliegue de software, la preparación del catálogo y la importación de personas se acreditan por separado.

## Verificación

Pruebas sintéticas de importación, actualización parcial, estados, acceso y permisos en licencia, credenciales, visibilidad, exportación y anonimización. La preparación privada concilia filas y hashes, y documenta exclusiones y correcciones. La verificación en producción conserva solamente agregados y referencias operativas en el repositorio.

El SHA `2a0cf6b31996b9f544f677546f3585da084493f4` quedó desplegado con estado SUCCESS en staging (`9c04e035-bd9f-44c0-bc0d-85f38f19dfe0`) y producción (`cbe18f1f-2052-4584-aa1f-87d2853b8436`). Las corridas CI `34277569936` y `34279813835` aprobaron 174 pruebas e2e cada una. En staging, el smoke aprobó 6/6 y la sonda sintética comprobó campos, fechas, ceros iniciales, actualización parcial y restricciones de licencia con rollback y relectura sin residuos. La sonda no acredita el upload/apply completo del asistente ni OTP o proveedores Wallet. La importación real sigue pendiente de publicar y activar la política y respaldar las autorizaciones; el catálogo se completó por una operación auditada separada, con 16 comités y seis términos nuevos y repetición sin creaciones. La comparación local del CSV contra el catálogo actualizado confirmó 453 filas válidas, cero errores y 452 altas más una actualización previstas; no se creó un ImportJob ni se aplicaron personas. Los recibos y límites están en el runbook.

## Consecuencias

La migración es aditiva y compatible con registros existentes. La publicación de privacidad y los pendientes de GH siguen siendo requisitos de datos, no se resuelven inventando aceptaciones ni fechas. Los originales y reportes de importación conservan su tratamiento privado y las reglas de retención vigentes.

## Enmienda (2026-09-08, ADR-047)

El punto 7 se concreta: el texto por publicar vive en [17-politica-de-datos.md](../17-politica-de-datos.md), la versión es la fecha de aprobación de la junta y el respaldo de las autorizaciones de membresía es la aceptación que cada integrante da al entrar a la OE, certificada por escrito antes de aplicar el lote. El orden de ejecución y su evidencia están en el [runbook](../15-runbook.md#habilitación-de-la-política-de-datos-adr-047-2026-09-08).

## Enmienda (2026-09-08, ADR-048)

El punto 7 deja de registrar consentimientos `MEMBERSHIP`/`IMPORT`: la carga solo crea personas, membresías y pertenencias, y cada integrante autoriza en su primer ingreso. Se conserva el requisito de política publicada y versión activa, porque esa pantalla necesita el texto.

## Enmienda (2026-09-13, ADR-060)

El punto 4 gana una excepción y un vencimiento: quien está en licencia y tiene un cargo de mesa vivo conserva las capacidades de ese cargo sobre su comité (Regl. art. 27 par. 6), aunque sigan suspendidos permisos, junta, grupos, participación y credenciales; y la licencia lleva regreso previsto obligatorio (`membership.leaveUntil`, máximo un año, Est. art. 5.4), con tarea a GH al vencer sin regreso y condición retomada al volver ([ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) regla 10).
