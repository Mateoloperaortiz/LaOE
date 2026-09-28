# ADR-014: Privacidad por diseño (Ley 1581 de 2012)

- Estado: Aceptada (enmendada por ADR-030, ADR-039, ADR-040, ADR-047, ADR-048, ADR-095)
- Fecha: 2026-09-02
- Relacionadas: ADR-002, ADR-013, ADR-015

## Contexto

Un CRM es un archivo de datos personales de estudiantes y contactos. En Colombia aplica la Ley 1581 de 2012 y el Decreto 1377 de 2013: autorización, finalidad, acceso, rectificación y supresión.

## Decisión

- `Consent` versionado por propósito (`MEMBERSHIP`, `COMMUNICATIONS`, `DIRECTORY_PHOTO`) y fuente (`FORM`, `IMPORT`, `ADMIN`), con fecha, versión de la política e IP cuando aplica.
- Público: cero datos personales. Directorio interno: nombre, foto opcional con consentimiento, comités y cargos. Correo y teléfono: solo `ADMIN`.
- "Descargar mis datos" (JSON) y "Solicitar eliminación" en Ajustes; la solicitud crea una tarea para un `ADMIN` con plazo de 15 días hábiles.
- Retención: egresados sin consentimiento vigente se anonimizan a los 5 años (teléfono, notas, respuestas de formularios) por el job programado `retention`; nombre, comités, cargos y ledger se conservan como historia institucional.
- La política vive en `/privacidad`; su versión vigente es la que registran los consentimientos nuevos. El roster importado registra consentimiento con fuente `IMPORT` y la versión vigente.

## Consecuencias

- Toda nota de CRM es visible para la persona si la solicita: se escribe con ese criterio.
- Los exportes con datos personales exigen step-up y quedan auditados.

## Enmienda (2026-09-03, ADR-030)

La retención de cinco años queda reemplazada: al salir, el perfil pasa a egresado con su historia institucional y se depura en ese momento lo que no es historia; la galería de egresados exige consentimiento `MEMORIAL`; la eliminación a pedido anonimiza de inmediato. Ver [ADR-030](ADR-030-perfil-de-egresado.md).

## Enmienda (2026-09-06, ADR-039)

Mientras la versión de política esté pendiente, la app rechaza nuevas autorizaciones y los flujos que las registran, conservando revocaciones, login y check-in. Se publica primero la política y se establece su versión al final. El bootstrap autorizado de ADR-039 no registra consentimientos ni los supone concedidos; solo crea el acceso inicial real y auditado. Ver [ADR-039](ADR-039-arranque-limpio-fase-7.md).

## Enmienda (2026-09-06, ADR-040)

Agregar el carnet a Google Wallet envía nombre, comités, semestre y semestre de ingreso a Google por acción propia, con aviso junto al botón. Apple se genera en la OE; el almacenamiento y la sincronización posteriores dependen de Apple y de la configuración de la persona. La política debe mencionar ambos antes de activar cuentas reales. La anonimización limpia el objeto remoto de Google con un reemplazo mínimo sin QR ni datos personales; se conserva la referencia local hasta éxito o 404, incluso si faltan credenciales. "Mis datos" incluye solo metadatos de pases y del token, nunca su secreto ni JWT. Ver [ADR-040](ADR-040-carnet-en-billeteras-fase-8.md).

## Enmienda (2026-09-08, ADR-047)

El texto publicado en `/privacidad` tiene fuente de verdad versionada en el repositorio y su versión es la fecha en que la junta lo aprueba. La autorización de membresía de quien entra por el roster se respalda en la aceptación que da al ingresar a la OE, certificada por escrito y archivada en evidencia privada; publicar una versión nueva no reescribe ni vuelve a pedir las autorizaciones ya registradas. Ver [ADR-047](ADR-047-politica-de-datos-y-habilitacion.md).

## Enmienda (2026-09-08, ADR-048)

El roster importado ya no registra consentimiento con fuente `IMPORT`. Quien no tenga una autorización viva de membresía pasa, al entrar a Mi OE, por una pantalla que le muestra la política publicada y la acepta con fuente `SELF`, su versión, su fecha y su IP. Ver [ADR-048](ADR-048-autorizacion-en-el-primer-ingreso.md).

## Enmienda (2026-09-28, ADR-095)

Dos excepciones acotadas a The Games. La vitrina pública puede mostrar el nombre de los capitanes de cada equipo cuando el ADMIN lo publica; la inscripción de Días EAFIT lo autorizó. El celular de los capitanes lo ve la operación de su competencia (ADMIN, la Dirección de The Games y el personal OPERATOR), no solo ADMIN, y se borra al archivarla. Ver [ADR-095](ADR-095-capitanes-de-the-games-desde-la-hoja-de-la-oe.md).
