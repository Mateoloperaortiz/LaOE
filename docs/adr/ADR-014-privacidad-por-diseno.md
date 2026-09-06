# ADR-014: Privacidad por diseño (Ley 1581 de 2012)

- Estado: Aceptada (enmendada por ADR-030, ADR-039)
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
