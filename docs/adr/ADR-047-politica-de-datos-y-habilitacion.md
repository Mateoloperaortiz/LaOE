# ADR-047: Política de datos, su versión y el respaldo de las autorizaciones

- Estado: Aceptada; borrador entregado, publicación pendiente de aprobación de la junta
- Fecha: 2026-09-08
- Enmienda: ADR-014, ADR-039 (punto 4) y ADR-046 (punto 7)
- Relacionadas: ADR-002, ADR-030, ADR-034, ADR-037, ADR-040, ADR-045

## Contexto

Producción quedó habilitada con la política en `pendiente`: la página `privacidad` existe en borrador y vacía, `privacy.policyVersion` conserva su centinela y el guard rechaza toda autorización nueva. Eso bloquea la aplicación del lote del roster ya validado (452 altas y una actualización) y las altas individuales normales. Faltaban tres cosas y ninguna es código: el texto real, su versión y el respaldo de las autorizaciones de membresía de quienes entran por el roster.

El texto no existía. Mateo pidió redactar un borrador para que la junta lo apruebe, y precisó que la autorización de tratamiento la da cada integrante **al entrar a la OE**: ese hecho institucional es el respaldo de los consentimientos que la importación registra.

## Decisión

1. **Fuente de verdad del texto.** El cuerpo publicado vive versionado en [17-politica-de-datos.md](../17-politica-de-datos.md), sección "Texto para publicar". Publicar es copiar esa sección al cuerpo de la página `privacidad` con `status = PUBLISHED` y `audience = PUBLIC`. Si el documento y la página difieren, manda el documento y se corrige la página. El texto describe lo que la app hace hoy; cuando el comportamiento cambie, se corrigen documento y código juntos y sube la versión.
2. **La versión es la fecha de aprobación** de la junta en formato `AAAA-MM-DD`, igual que la normativa de ADR-042. Se guarda en `privacy.policyVersion` desde `/admin/sistema/politica` con ADMIN y step-up, después de publicar y revisar `/privacidad`. No se activa una versión que la junta no haya aprobado ni un valor de relleno.
3. **Respaldo de las autorizaciones de membresía.** La aceptación del tratamiento que cada integrante da al ingresar a la OE es la autorización que sostiene los `Consent` `MEMBERSHIP`/`IMPORT` de la carga del roster. Antes de aplicar el lote, la junta o Gestión Humana deja constancia escrita de que la admisión incluye esa aceptación y de dónde está la evidencia; la constancia se archiva en evidencia privada y se referencia desde el runbook, sin datos personales en el repositorio. Una fila sin ese respaldo no se importa: no se inventan aceptaciones ni fechas.
4. **Marcadores obligatorios antes de publicar.** Responsable del tratamiento y su vínculo con EAFIT, domicilio, buzón real de atención al titular, fecha de aprobación y el tratamiento de integrantes menores de edad (el roster admite documento `TI`). Mientras alguno siga sin resolver, la página no se publica y la versión sigue en `pendiente`.
5. **Las autorizaciones ya registradas no se reescriben.** Publicar una versión nueva no cambia la versión estampada en un consentimiento vivo, no lo revoca ni lo vuelve a pedir. Un cambio sustancial se avisa por los canales de la OE; esa comunicación es una operación aparte y explícita, no un efecto de guardar la versión.
6. **`pendiente` sigue siendo el freno.** Guardarlo vuelve a bloquear de inmediato altas, importaciones y autorizaciones nuevas sin borrar el texto publicado ni los consentimientos anteriores. El acceso, la navegación, el check-in y las revocaciones siguen disponibles.
7. **Orden de la habilitación.** Ensayo completo en staging (publicar, activar, importar un CSV sintético, repetir) → respaldo previo verificado en producción → publicar la página → revisar `/privacidad` → activar la versión → aplicar el lote con step-up → verificar y registrar. Cada paso se acredita por separado en el runbook.

## Consecuencias

- La habilitación deja de depender de una decisión técnica: depende de que la junta apruebe un texto y certifique el respaldo. El código no cambia; el control de política y el asistente ya están desplegados y probados.
- El repositorio conserva el texto publicado y su versión, así que se puede reconstruir qué decía la política que cada persona autorizó.
- Aceptar el respaldo por la vía de la admisión implica que la OE debe poder mostrar esa evidencia si un titular o una autoridad la pide; por eso la constancia es un requisito y no una formalidad.
- Este documento no es asesoría jurídica: el borrador lo revisa y aprueba la junta, que decide si además necesita revisión legal de la Universidad.

## Enmienda (2026-09-08, ADR-048)

El punto 3 cambia de alcance: la constancia de la admisión respalda el periodo anterior, no las autorizaciones de la carga, porque la importación deja de crearlas. Cada persona autoriza en su primer ingreso ([ADR-048](ADR-048-autorizacion-en-el-primer-ingreso.md)).

## Decisión de publicación · 2026-09-08

La junta aprobó el texto con la Universidad EAFIT como responsable, dirección Carrera 49 N.º 7 Sur-50, canal `datospersonales@eafit.edu.co` y versión `2026-09-08`. Sobre menores de edad se publica que la autorización otorgada a EAFIT al matricularse cubre este tratamiento. **Esa afirmación se publica sin que la Universidad la haya confirmado**: la consulta a `datospersonales@eafit.edu.co` estaba abierta al momento de decidirlo, y Mateo pidió expresamente publicarla igual. Si la respuesta la contradice, hay que corregir el texto, subir la versión y revisar las autorizaciones de las 15 personas menores de edad del lote.
