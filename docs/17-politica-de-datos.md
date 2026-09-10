# Política de tratamiento de datos personales

Este documento es la fuente de verdad del texto que se publica en `/privacidad`. El cuerpo de la página (`Page` con slug `privacidad`, Markdown, `PUBLISHED`/`PUBLIC`) se copia de la sección **Texto para publicar**; su versión es la que se guarda en `privacy.policyVersion` desde `/admin/sistema/politica` y la que queda estampada en cada `Consent`. Reglas en [ADR-047](adr/ADR-047-politica-de-datos-y-habilitacion.md), [ADR-014](adr/ADR-014-privacidad-por-diseno.md) y [ADR-039](adr/ADR-039-arranque-limpio-fase-7.md).

**Estado: aprobado por la junta el 2026-09-08 y listo para publicar.** Lo redactó Mateo con apoyo del asistente para que la junta lo revise, complete y apruebe; no reemplaza revisión jurídica. Mientras tenga marcadores sin resolver, la página sigue en borrador y `privacy.policyVersion` sigue en `pendiente`.

## Cambio pendiente de aprobación (2026-09-10)

**El texto publicado quedará desactualizado cuando lleguen las contraseñas.** La sección "Seguridad" de la versión `2026-09-08` dice que se entra "con un código de un solo uso enviado a tu correo institucional; no hay contraseñas que se puedan filtrar". [ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md) cambia eso: la credencial pasa a ser una contraseña propia guardada como hash `scrypt`. El texto nuevo ya está escrito abajo, en "Texto para publicar".

La versión es la fecha en que la junta aprueba (ADR-047, punto 2), así que **no se rellena acá**: queda en `2026-09-08` hasta que la junta apruebe el texto nuevo, y ese es un **requisito para promover las contraseñas a producción**, no un trámite posterior. Publicar una versión nueva no revoca ni vuelve a pedir las autorizaciones vivas (ADR-047, punto 5), de modo que el costo operativo es bajo.

## Qué se resolvió y qué queda anotado

Resueltos por la junta el 2026-09-08: responsable **Universidad EAFIT**, dirección Carrera 49 N.º 7 Sur-50 de Medellín, canal `datospersonales@eafit.edu.co` y versión `2026-09-08`, que es la fecha de la aprobación.

**Menores de edad.** El lote del 2026-2 incluye 22 documentos `TI` y 15 personas que a la fecha de preparación tenían 17 años. La junta decidió cargarlas en el mismo lote y publicar que la autorización otorgada a EAFIT al matricularse cubre este tratamiento. Esa afirmación **se publica antes de que la Universidad la confirme**: la consulta a `datospersonales@eafit.edu.co` sobre responsable, menores y RNBD sigue abierta. Si la respuesta la contradice, hay que corregir el texto, subir la versión y revisar las autorizaciones de esas personas. Queda registrado así por decisión expresa de Mateo del 2026-09-08.

**Respaldo de las autorizaciones.** Desde [ADR-048](adr/ADR-048-autorizacion-en-el-primer-ingreso.md) cada persona autoriza en su primer ingreso a Mi OE: la importación ya no registra consentimientos a nombre de la OE. La constancia de la admisión respalda el periodo anterior, no las autorizaciones nuevas.

## Cómo se verificó el contenido

Cada categoría de datos, finalidad y tercero del texto corresponde a algo que la app hace hoy: `person` y `consent` en `src/modules/people/schema.ts`, la exportación propia en `src/app/api/mis-datos/route.ts`, las notificaciones en `src/modules/comms`, el carnet y los pases en `src/modules/wallet`, y los proveedores efectivamente configurados en producción (Railway, Cloudflare/R2, Resend, Apple y Google). Si el texto y el código dejan de coincidir, se corrigen los dos y sube la versión.

---

## Texto para publicar

Todo lo que sigue es el cuerpo de la página. **No lleva título propio**: `/privacidad` ya pinta "Tratamiento de datos personales" como `h1` desde `Page.title`, así que el cuerpo empieza en `##`. El Markdown admite tablas (remark-gfm) y descarta HTML embebido.

- **Responsable:** Universidad EAFIT
- **Dirección:** Carrera 49 N.º 7 Sur-50, Medellín, Colombia
- **Correo de atención:** datospersonales@eafit.edu.co
- **Versión:** 2026-09-08, aprobada el 8 de septiembre de 2026

La Organización Estudiantil de la Universidad EAFIT (la OE) trata datos personales de sus integrantes, de quienes se postulan, de sus egresados y de los contactos con los que trabaja. Esta política explica qué datos guardamos, para qué, con quién los compartimos y cómo podés ejercer tus derechos. Se rige por la Ley 1581 de 2012, el Decreto 1377 de 2013 y las normas que los modifiquen.

## Qué datos tratamos

- **Identificación y contacto:** nombre y apellidos, nombre preferido, correo institucional (es tu identidad de acceso), correo personal, celular, programa académico y foto, si la subís.
- **Datos de registro académico y de identidad:** tipo y número de documento, ID EPIK y fecha de nacimiento, cuando la OE los recibe en el listado de integrantes. Solo los ven los administradores y vos.
- **Membresía:** semestre de ingreso, estado (activo, en licencia, honorario, retirado), periodo de prueba, comités por semestre, cargos y fechas de salida.
- **Participación:** asistencia a las actividades que registrás con tu carnet, GH Points y partidas del juego diario.
- **Permanencia:** evaluaciones, puntajes y créditos del semestre, y el resultado de cada cierre.
- **Comunicaciones:** tus preferencias de avisos, los mensajes que la OE te envía y los dispositivos donde activás notificaciones.
- **Solicitudes y formularios:** postulaciones, solicitudes de licencia, retiro o cambio de comité, y respuestas a los formularios que llenás. Las encuestas posteriores a una actividad son anónimas: no quedan asociadas a vos.
- **Gestión interna:** notas y registros de seguimiento de Gestión Humana, y tareas asociadas a tu proceso.
- **Datos técnicos:** sesiones abiertas con su navegador, dirección IP y fechas, y el registro de auditoría de las operaciones que te afectan.
- **Carnet:** el código de tu carnet y, si lo agregás, los datos del pase en Apple Wallet o Google Wallet.

La OE no pide datos sensibles: los que revelan origen racial o étnico, orientación política, convicciones religiosas o filosóficas, pertenencia a sindicatos, datos de salud, de vida sexual o biométricos. Si alguna vez hiciera falta uno, se pediría por separado, explicando que responder es facultativo.

## Para qué los usamos

1. Gestionar tu membresía: admisión, comités, cargos, licencias, permanencia y salida.
2. Registrar tu participación y calcular GH Points y reconocimientos.
3. Darte acceso a Mi OE, a tu carnet y a la normativa interna.
4. Comunicarnos con vos: avisos de la OE, recordatorios y campañas por correo, siempre con la opción de darte de baja.
5. Atender tus solicitudes y las de quienes se postulan.
6. Conservar la historia institucional de la OE y, si lo autorizás, mostrarte en la galería de egresados.
7. Cumplir obligaciones legales y responder requerimientos de autoridad competente.

Tu foto se usa para identificarte dentro de la OE: aparece en el directorio interno y en los reconocimientos solo si autorizás ese uso, y podés retirar esa autorización cuando quieras.

## Tu autorización

Al ingresar a la OE aceptás el tratamiento de tus datos para gestionar tu participación en ella. Esa autorización queda registrada en la app con la versión de esta política vigente en ese momento, junto con la fecha. Las autorizaciones adicionales —comunicaciones, foto en el directorio y galería de egresados— las das y las retirás vos desde **Mi OE → Ajustes → Consentimientos**.

Quien responde un formulario público de la OE autoriza el tratamiento marcando la casilla correspondiente antes de enviarlo.

La autorización de membresía sostiene tu vínculo con la OE: si querés retirarla, pedí la eliminación de tus datos desde Ajustes. Cambiar la versión de esta política no altera las autorizaciones ya registradas ni la versión con la que quedaron.

## Con quién compartimos los datos

La OE no vende ni cede tus datos. Trabajamos con proveedores que actúan como encargados y solo tratan los datos para prestarnos su servicio:

| Proveedor | Para qué | Dónde |
| --- | --- | --- |
| Railway | Servidor, base de datos y archivos de la app | Estados Unidos |
| Cloudflare | Dominio, protección del sitio y almacenamiento de las copias de respaldo cifradas | Estados Unidos |
| Resend | Envío de los correos de la app | Estados Unidos |
| Apple | Notificaciones en dispositivos Apple y, si lo agregás, el carnet en Apple Wallet | Estados Unidos |
| Google | Notificaciones en navegadores basados en Chrome y, si lo agregás, el carnet en Google Wallet | Estados Unidos |

Si usás otro navegador, las notificaciones pasan por el servicio de mensajería de su fabricante, por ejemplo Mozilla.

Agregar el carnet a Google Wallet envía tu nombre, tus comités y tus semestres a Google por acción tuya; el aviso aparece junto al botón. Lo que Apple o Google hagan después con ese pase depende de la configuración de tu propia cuenta y de sus políticas.

Estas operaciones implican transferencia y transmisión internacional de datos, que aceptás al autorizar el tratamiento y al usar cada función.

Dentro de la OE, tu correo, tu celular y tus datos de documento solo son visibles para quien tiene permiso de administración; el resto de integrantes ve tu nombre, tu foto autorizada, tus comités y tus cargos.

## Tus derechos

Podés, en cualquier momento:

- Conocer, actualizar y rectificar tus datos.
- Pedir prueba de la autorización que diste.
- Ser informado sobre el uso que se les ha dado.
- Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley.
- Revocar la autorización o pedir la supresión de tus datos cuando no exista un deber legal o contractual que lo impida.
- Acceder gratuitamente a tus datos.

En la app tenés dos atajos, en **Mi OE → Ajustes**: **Descargar mis datos**, que te entrega en un archivo todo lo que la OE guarda sobre vos, y **Solicitar eliminación**, que abre el trámite ante Gestión Humana.

## Cómo ejercerlos

Escribí a datospersonales@eafit.edu.co desde tu correo institucional, o usá los botones de Ajustes. Indicá tu nombre, tu correo y qué necesitás.

- **Consultas:** respondemos en diez (10) días hábiles. Si no es posible, te avisamos por qué y respondemos dentro de los cinco (5) días hábiles siguientes.
- **Reclamos:** respondemos en quince (15) días hábiles. Si no es posible, te avisamos por qué y la fecha en que responderemos, dentro de los ocho (8) días hábiles siguientes.
- **Eliminación:** Gestión Humana revisa la solicitud y te contacta antes de borrar nada; la respuesta llega dentro de los quince (15) días hábiles siguientes.

Al eliminar tus datos conservamos tu historia institucional sin tu nombre: la OE necesita saber cuántas personas participaron en cada semestre, no quiénes eran.

## Integrantes menores de edad

Algunas personas vinculadas a la OE son menores de edad. Sus datos se tratan con la misma finalidad de gestionar su participación, atendiendo su interés superior y sus derechos fundamentales. La autorización otorgada a la Universidad EAFIT al matricularse cubre este tratamiento, por ser EAFIT la responsable. El menor o su representante legal puede ejercer todos los derechos de esta política por los mismos canales.

## Cuánto tiempo los conservamos

Tratamos tus datos mientras dure tu vínculo con la OE. Al salir, tu perfil pasa a egresado y se depura lo que no es historia institucional; tu nombre, comités, cargos y participación se conservan como memoria de la organización. Aparecés en la galería de egresados solo si lo autorizaste. Las copias de respaldo se guardan cifradas y se rotan periódicamente.

## Seguridad

Entrás a Mi OE con tu correo institucional y una contraseña que elegís vos. Esa contraseña no se guarda tal cual: se guarda transformada con una función criptográfica que no se puede revertir, y ni la OE ni quien administra el sistema puede leerla. Nunca te la vamos a pedir por correo, WhatsApp ni por teléfono. Tu primera contraseña, y la recuperación si la perdés, llegan por un enlace que emite la junta, que sirve una sola vez, vence en una hora y cierra las sesiones que tuvieras abiertas. Cada emisión queda registrada con quién la hizo y para quién. Las operaciones sensibles piden confirmar tu identidad de nuevo, quedan auditadas y solo las pueden hacer personas con permiso. Las copias de respaldo viajan y se almacenan cifradas.

## Vigencia y cambios

Esta política rige desde el 8 de septiembre de 2026 y mientras la OE trate datos personales. Si cambia, publicamos la versión nueva en esta página con su fecha; las autorizaciones ya otorgadas conservan la versión con la que se registraron y te avisamos por los canales de la OE cuando el cambio sea sustancial.
