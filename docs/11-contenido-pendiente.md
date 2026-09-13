# Contenido que la OE debe aportar

Sin esto el sitio queda bonito y vacío. Se marca cuando el material está en manos de Mateo y con permiso de uso. Los textos de la interfaz, correos y notificaciones están inventariados uno por uno en [14-copy-y-textos.md](14-copy-y-textos.md), con quién debe escribir cada uno.

## Personas

- [ ] Input privado del primer ADMIN: nombre, apellidos, correo institucional y término de ingreso con fechas reales para `bootstrap-admin`; no se toman datos de ejemplos ni de GHPOINTS
- [ ] Término actual con fechas reales, configurado desde el admin antes de cargar el roster

- [ ] Roster del término con las columnas acordadas: `NOMBRE`, `APELLIDO`, `CORREO`, `CELULAR`, `PREGRADO`, `COMITES`, `ENTRADA A LA OE`, `ESTADO` y la nueva `CARGO` ([13-importacion-del-roster.md](13-importacion-del-roster.md)); GH lo envía cuando termine de limpiar su base
- [x] Vocabulario de `ESTADO` (Activo, Licencia, Honorario, Retirado, Prueba) y lista de cargos (seis), confirmados por GH
- [ ] Segunda entrega con `CORREO` y `CARGO` para completar los cargos (la base actual no los tiene)
- [ ] Lista de líderes de comité y cargos de junta del término actual
- [ ] Quién tendrá permiso ADMIN además de Mateo

## Comités

- [ ] Texto de presentación de cada uno de los 27 comités (2 a 4 párrafos)
- [ ] Contacto o enlace de cada comité (Instagram, correo, WhatsApp)
- [ ] Confirmar que la lista de 27 comités con logo sigue vigente (comités nuevos o cerrados)
- [ ] Nombre oficial de cada comité: el seed sintético y la primera carga usan la sigla del logo en mayúsculas como nombre provisional
- [x] Reparto de capacidades por cargo y existencia de Mercadeo: decidido el 2026-09-13 siguiendo los Estatutos 2026 (mesa de seis cargos, Publicidad retirado y traducido a Mercadeo, Logística con roster; [ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 4). Queda para GH revisar el reparto desde `/admin/cargos` si quiere afinarlo
- [ ] Qué deben ver Relaciones Públicas y Financiero en el área Aliados de su comité: organizaciones y patrocinios ligados al comité, hoy sin comité en la base ([ADR-058](adr/ADR-058-direccion-del-comite-por-areas.md))
- [ ] Presupuesto de los comités: rubros estándar, si es por año calendario o por semestre, si un traslado entre rubros exige aprobación de la Vicepresidencia Financiera, si se adjuntan soportes y si hay topes por rubro ([ADR-059](adr/ADR-059-presupuesto-del-comite.md))
- [ ] Representante ante la Asamblea Directiva y suplente de cada comité en 2026-2, para llevar la asistencia por comité que exige el Reglamento (art. 14, 17 y 64; [18-revision-normativa-2026.md](18-revision-normativa-2026.md), V4)

## Eventos

- [ ] Descripción de cada macroevento: Días EAFIT, Inventiva, EnFemenino, Subsidios-OE
- [ ] Fechas reales de la próxima edición de cada uno (no se inventan)
- [ ] Portadas o fotos con permiso de uso; sin fotos de personas sin consentimiento
- [ ] Quiénes ocupan la mesa directiva de cada macroevento en la edición en curso (el catálogo de cargos ya lo siembra la migración `0022` desde el Regl. art. 41 a 43; se registran en `/admin/eventos/[id]/ediciones/[edicionId]/mesa`) y quiénes los ocupan en la edición en curso (Regl. art. 41 a 43; [18-revision-normativa-2026.md](18-revision-normativa-2026.md), V6)

## Normativa y privacidad

- [ ] Publicar la página `privacidad` desde Páginas con audiencia PUBLIC, estado PUBLISHED y cuerpo completo; revisar `/privacidad` y guardar la versión desde Política de datos (`/admin/sistema/politica`) con ADMIN y step-up. El control está desplegado y verificado en producción; el cuerpo sale de [17-politica-de-datos.md](17-politica-de-datos.md) y su publicación espera la aprobación de la junta. Habilita nuevas aceptaciones, altas y roster; el bootstrap no registra consentimiento
- [ ] Revisión de JUNTA de T-1178 y T-1179, avisos de política pendiente
- [x] **Aprobación de la junta al texto nuevo de "Seguridad" de la política y a su versión ([ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md)).** La versión `2026-09-08` dice que no hay contraseñas; con las contraseñas propias esa frase queda falsa. El texto de reemplazo ya está escrito en [17-politica-de-datos.md](17-politica-de-datos.md) y la versión nueva es la fecha en que la junta lo apruebe. Aprobado el 2026-09-10: la versión es `2026-09-10`. Falta publicar el cuerpo en la página `privacidad` y guardar la versión desde `/admin/sistema/politica`; no revoca ni vuelve a pedir las autorizaciones vivas

- [x] Estatutos vigentes en PDF: el firmado con la reforma del 2026-05-08 (28 páginas) está en manos de Mateo; se sube desde `/admin/documentos` y sus artículos se extraen con `scripts/normativa-extract.py` en la fase 2
- [x] Reglamento vigente en PDF: el firmado con la reforma del 2026-05-08 (43 páginas, con el Anexo 1) está en manos de Mateo; mismo camino
- [x] Publicación real de normativa 2026 (ADR-042), verificada el 2026-09-08: estatutos 60 artículos + 3 secciones; reglamento 74 artículos + 4 secciones, organigrama, tabla y Anexo 1; versión 2026-05-08, PUBLISHED/MEMBERS. PDFs originales e integridad del contenido, búsquedas, acceso privado y repetición sin duplicados comprobados en producción. IDs, hashes y evidencia en el [runbook](15-runbook.md#normativa-completa-de-2026-adr-042).
- [ ] Aprobación de la junta al borrador de la política ([17-politica-de-datos.md](17-politica-de-datos.md), ADR-047) y los cinco marcadores que faltan: responsable del tratamiento y su vínculo con EAFIT, domicilio, buzón real de atención al titular, fecha de aprobación (que es la versión) y qué se hace con integrantes menores de edad: el CSV preparado del 2026-2 trae 22 documentos `TI` y 15 personas de 17 años, más 25 filas sin fecha de nacimiento. La política de EAFIT ya existe y nombra a la Universidad como responsable, así que la decisión de fondo es si este texto es el aviso específico de la casa digital bajo esa política. El borrador ya cubre galería de egresados, contacto posterior a la salida, push, campañas y billeteras; su versión es la que se guarda en `privacy.policyVersion` (hoy "pendiente") y la que registran los consentimientos
- [ ] Constancia escrita de la junta o de GH de que la admisión a la OE incluye la aceptación del tratamiento de datos, y dónde está esa evidencia. Desde ADR-048 ya no respalda la carga —cada persona autoriza en su primer ingreso—, pero sí el periodo anterior a la casa digital
- [ ] Correo de salida voluntaria (T-206) y correo a los importados (T-201): sin texto final la app no los envía

- [ ] Política y avisos de billeteras (ADR-040): nombre, comités, semestre y semestre de ingreso enviados a Google por acción propia; almacenamiento/sincronización de Apple según su configuración; revisión de T-1214 y T-1215 antes de activar cuentas reales

## Marca

- [x] Logos de los 27 comités en SVG monocromo: ya están en `LaOE/public/logos/committees` (pasan al repositorio en la fase 0)
- [x] Logo vertical de la OE como máscara monocroma (`oe.svg`): sirve para las variantes navy y blanca
- [x] Fuentes: la OE no tiene licencias; se usan Sofia Sans Extra Condensed y Plus Jakarta Sans (decisión cerrada el 2026-09-02)
- [x] Isotipo como favicon e ícono de PWA: aprobado
- [ ] Logo horizontal en SVG (el manual lo llama "menos utilizado"; sirve para la barra de navegación). Mientras no exista, se usa el vertical a tamaño pequeño
- [ ] Logo principal a color en SVG (con sus azules propios) para pie de página y carnet; hoy solo existe la máscara monocroma
- [ ] Texturas oficiales (papel, granito) en alta resolución si existen; si no, se usan las generadas en la web

## Permanencia

- [x] Tabla general de permanencia del término (recibida en capturas; GH confirmó que vale unos 50 puntos)
- [x] Reparto entre tablas y regla para varios comités (general ≈ 50, comité ≈ 60, resultado por comité)
- [x] Lista de comités de trabajo con su significado y sus líderes (falta el Athletic)
- [x] Quién evalúa cada grupo (directores de GH; nuevos, el GH principal)
- [ ] Tablas de permanencia de los 27 comités del término (ejemplo recibido: A3, con los eventos 1 y 2 aún sin peso)
- [ ] Lista de directores de GH por frente (GH la envía cuando termine de limpiar su base)
- [ ] Nombres del capitán y el DT del Athletic
- [ ] Calendario de integraciones y de partidos del Athletic del término (mientras no esté, las reglas usan 10 integraciones y 3 partidos esperados, como dijo GH)
- [ ] Confirmar con GH los supuestos de la fase 4: prueba con transferencia usa 80 %; en licencia y honorarios no se evalúan; las evaluaciones pendientes al cerrar cuentan como no logradas; el aviso del nominal salta a 5 puntos
- [ ] Descripción de una línea de cada criterio de la tabla general (T-126) y de los criterios de cada comité
- [ ] Textos sensibles del cierre: periodo de prueba (T-203) y salida (T-204); desde la fase 6 la app manda por correo el resultado de quien cumple (T-202) y estos dos siguen en persona hasta tener texto
- [ ] Causales del Anexo 1 (llamados de atención, faltas leves y graves) y lista de excusas válidas como catálogo, si la decisión 9 de [decisiones-abiertas.md](decisiones-abiertas.md) mete faltas y excusas en la app ([18-revision-normativa-2026.md](18-revision-normativa-2026.md), V1 y V2)

## Operación

- [ ] Puntos por tipo de ocasión para el término (tope de comités y asambleas ya están decididos)
- [ ] Fechas de las dos asambleas ordinarias (una sola es obligatoria) y, en el segundo semestre, de la elección de junta
- [ ] Nombres y cortes de los niveles de GH Points (T-082); mientras tanto rigen los propuestos (0, 100, 250, 500, 1000)
- [ ] Texto de "Unirse": requisitos y fechas de convocatoria
- [ ] Preguntas reales del formulario de admisión (el seed trae unas sintéticas) y el texto de gracias que ve quien postula
- [ ] Etapas reales del proceso de admisión si difieren de la plantilla (Recibida, Entrevista, Admitida, Alta, No admitida) y de la de patrocinio (Contacto, Propuesta, Negociación, Cerrado, Sin acuerdo)
- [ ] Aliados y contactos institucionales reales (empresas, unidades de EAFIT, grupos estudiantiles) con permiso para cargarlos; montos y contraprestaciones de los patrocinios vigentes
- [ ] Cupos y ventanas de las convocatorias internas del término (GT, GAP, GAP OE, barra brava, tareas de nuevos)
- [ ] Confirmar con GH los supuestos de la fase 5: cinco días hábiles para responder una solicitud; el cambio de comité aprobado rige desde el semestre siguiente como transferencia; la casilla de un formulario público es consentimiento de tratamiento de datos y el de membresía se registra al dar de alta; el retiro voluntario aprobado avisa con T-205 mientras T-206 no tenga texto final
- [ ] Pasos del onboarding de nuevos (qué debe hacer un nuevo en su primera semana)
- [ ] Preguntas reales de la encuesta corta tras una ocasión: el seed trae una calificación de 1 a 5 y un comentario; GH elige el formulario por defecto en `survey.defaultFormId`
- [x] Claves VAPID propias para producción y staging generadas y cargadas el 2026-09-06; `VAPID_SUBJECT=https://oeeafit.com` como URL válida de contacto. La prueba de push en iPhone sigue pendiente
- [ ] Confirmar con GH los supuestos de la fase 6: horas de los recordatorios (07:00 las actividades de hoy, 18:00 las reuniones y asambleas de mañana, 2 a 3 horas antes de cada asamblea) y de los avisos de permanencia (09:00); 50 correos por minuto en campañas; quien está en licencia no recibe push; los comentarios de la encuesta se muestran solo con 3 o más respuestas
- [x] Que la política de tratamiento de datos mencione las notificaciones push y las campañas por correo con su baja: el borrador las cubre; queda sujeto a la aprobación del texto
- [x] Acceso al dominio `oeeafit.com` (DNS) y a la cuenta de Resend comprobado el 2026-09-06; el dominio todavía no se ha movido; activación R2 registrada abajo

- [ ] Fecha y aviso de lanzamiento de la app nueva por los canales de la OE; indicar cómo entrar por OTP y recordar la sesión antes de una asamblea
- [ ] SES: habilitación futura cuando exista cuenta; queda fuera del lanzamiento
- [x] Privada age guardada en 1Password y comprobada por descarga/SHA el 2026-09-06; ubicación operativa y evidencia privadas registradas en el runbook
- [x] Cloudflare R2 activado por Mateo y verificado el 2026-09-06: bucket privado `oe-respaldos` creado, token restringido al bucket y variables de backup configuradas. Restauración externa de staging comprobada con app y medios; primera copia de producción ejecutada y restaurada con app local verificada
- [x] Inputs reales del bootstrap completados por vía privada y ejecutados el 2026-09-06; identidad, código y fechas exactas permanecen solo en bootstrap-admin.json privado. Primer acceso por OTP y ADMIN verificados

### Activación de billeteras (fase 8, ADR-040)

- [ ] Decisión de pago y titular del Apple Developer Program; verificar tarifa vigente al contratar, separado del tope Railway
- [ ] Apple: inscripción, Pass Type ID distinto por entorno, Team ID, certificado/clave de firma válidos, responsable y fecha de renovación; custodia privada, nunca en el repositorio
- [x] Google: cuenta de emisor, proyecto Cloud con Wallet API, cuenta de servicio autorizada, usuarios de prueba y solicitud de acceso de publicación. Emisor, API y cuentas de servicio por entorno listos; publicación general solicitada y aprobada el 2026-09-11, con correo de Google a las 18:22 de Bogotá; las cuentas de prueba dejan de ser necesarias
- [ ] Credenciales reales por entorno, sufijo Google propio de staging y variables adoptadas/preservadas en IaC; activar cada plataforma por separado
- [ ] COM: validar textos de organización/billetera T-1189 y T-1197 y aplicar el uso aprobado del isotipo; badges oficiales en español sin rediseño
- [ ] iPhone: guardar un pase firmado válido desde navegador y PWA sobre HTTPS; Android/Google: guardar con cuenta autorizada; escanear ambos en modo anfitrión, probar revocación y actualización
- [ ] Registrar por separado implementación con fixtures y activación real de Apple/Google; no marcar el criterio real con claves de juguete ni cerrar pendientes de la fase 7
- [ ] Validación del badge Apple por la cuenta titular al activar: candidato `es-MX` de Cinto 1.0.98 sin modificaciones propias, optimizado por el distribuidor, sin comparación byte a byte con el ZIP Apple ni aceptación del acuerdo. Google `es-ES` proviene del ZIP oficial; conservar ambas procedencias con la revisión F8-T6, sin tratarlos como arte generado por `wallet:assets`

Las pruebas reales y el diagnóstico de los proveedores se registran siguiendo [16-billeteras.md](16-billeteras.md).
