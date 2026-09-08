# ADR-046: Integración del roster y acceso de consulta en licencia

- Estado: Aceptada; implementación y verificación en curso
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

## Consecuencias

La migración es aditiva y compatible con registros existentes. La publicación de privacidad y los pendientes de GH siguen siendo requisitos de datos, no se resuelven inventando aceptaciones ni fechas. Los originales y reportes de importación conservan su tratamiento privado y las reglas de retención vigentes.
