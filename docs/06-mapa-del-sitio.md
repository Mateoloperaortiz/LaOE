# Mapa del sitio

## Público (sin sesión)

| Ruta | Contenido |
| --- | --- |
| `/` | Cartelera, próximo encuentro, acceso a macroeventos, "Entrá a Mi OE" |
| `/la-oe` | Historia desde 1987, misión, visión, "lo hacemos por vos", contacto (Bloque 29 of. 525, oe@eafit.edu.co) |
| `/cartelera` | Anuncios con audiencia pública, fijados primero |
| `/cartelera/[id]` | Un anuncio con su imagen para compartir; es la URL que usará el push de la fase 6 |
| `/eventos` | Catálogo de eventos permanentes: Días EAFIT, Inventiva, EnFemenino, Subsidios-OE |
| `/eventos/[slug]` | Identidad del evento y sus ediciones publicadas |
| `/eventos/[slug]/[edicion]` | Micrositio de la edición: fechas, lugar, organizadores, inscripción propia (`/f/[slug]`) o enlace externo, galería opcional |
| `/comites` y `/comites/[slug]` | Fichas editoriales con logo, presentación y contacto; el roster nunca es público |
| `/unirse` | Cómo postularse; formulario de postulación si hay convocatoria abierta, prospecto si no |
| `/f/[slug]` | Formularios públicos |
| `/privacidad` | Política de tratamiento de datos vigente |
| `/api/ics/publico.ics` | Calendario de ediciones públicas |
| `/ingresar` | OTP |
| `/ingresar/paso` | Step-up: un código nuevo antes de una acción sensible del admin (conceder permisos, exportes con datos personales); vuelve a `next` |

## Mi OE (sesión de miembro)

| Ruta | Contenido |
| --- | --- |
| `/app` | Saludo, agenda del término, mis comités, saldo del término, barra de permanencia, anuncios para miembros; lista de onboarding mientras la persona sea nueva |
| `/app/eventos` | Eventos y ediciones incluyendo audiencia de miembros |
| `/app/comites` y `/app/comites/[slug]` | Comités con piezas internas y contactos |
| `/app/personas` | Directorio: nombre, foto opcional, comités del término con el cargo en cada uno ("General de A3"), cargos de junta. Sin correos |
| `/app/egresados` | Galería de egresados por año de salida: nombre, foto con consentimiento, comités, cargos y años en la OE; solo quienes dieron consentimiento `MEMORIAL` |
| `/app/solicitudes` | Mis solicitudes: licencia, retiro voluntario, cambio de comité, transferencia interna; estado y respuesta de GH |
| `/app/convocatorias` | Convocatorias internas abiertas (GT, GAP, GAP OE, barra brava, tareas de nuevos): inscripción directa al grupo, cupo y cierre |
| `/app/gh-points` | Saldo, nivel, movimientos, rankings (nuevos, veteranos, comités), asambleas firmadas/requeridas |
| `/app/permanencia` | Resultado por cada comité frente a su umbral (60, 80 o 70 %), bloque general y bloque del comité criterio por criterio, cómo sumar más, asambleas obligatorias, evaluaciones pendientes, historial |
| `/app/normativa` y `/app/normativa/[id]` | Estatutos, reglamento y actas: lista con buscador sobre los artículos y lector con índice por capítulo; el PDF firmado se abre por enlace prefirmado |
| `/app/carnet` | QR personal firmado para acreditación (token de 24 horas) |
| `/app/ajustes` | Una sola página con las secciones de T-133: mis datos (foto, celular y correo personal con consentimiento), notificaciones (fase 6), sesiones, consentimientos, mis datos y privacidad (descargar mis datos, solicitar eliminación) |
| `/api/mis-datos` | JSON con todo lo que la OE guarda sobre la persona con sesión; auditado |
| `/a/[publicId]` | Check-in de una ocasión; sin sesión redirige a `/ingresar` y vuelve |
| `/api/ics/mi-agenda.ics` | Calendario personal con token |

## Administración (permiso ADMIN; vistas parciales para líderes)

| Sección | Rutas | Contenido |
| --- | --- | --- |
| Inicio | `/admin` | Pendientes del actor, tareas vencidas, ocasiones abiertas, alertas de jobs y respaldo |
| Personas | `/admin/personas`, `/admin/personas/[id]`, `/admin/personas/importar`, `/admin/segmentos`, `/admin/etiquetas`, `/admin/tareas` | CRM: listado por el kit con filtros (etapa, estado, comité, segmento) y export con step-up; Persona 360 a medida con pestañas y acciones en panel lateral (las pestañas de fases posteriores muestran T-240); asistente de importación del roster en tres pasos (archivo y semestre, columnas, revisión y confirmación con step-up) ([13-importacion-del-roster.md](13-importacion-del-roster.md)); segmentos como filtros guardados con conteo y export; etiquetas; tareas con filtro por responsable |
| Organizaciones | `/admin/organizaciones`, `/admin/organizaciones/[id]` | Empresas, unidades de EAFIT, grupos; contactos y patrocinios |
| Pipelines | `/admin/pipelines`, `/admin/pipelines/[id]` | Kanban de admisión, patrocinio y personalizados |
| Solicitudes | `/admin/solicitudes` | Bandeja de solicitudes de miembros; aprobar ejecuta el comando (licencia, baja, cambio de comité, transferencia); rechazar exige motivo |
| Convocatorias | `/admin/convocatorias`, `/admin/convocatorias/[id]` | Convocatorias internas por grupo de trabajo con cupo, ventana y selección de inscritos |
| Junta | `/admin/junta` | Panel de indicadores sin datos personales: retención por semestre, nuevos por comité, distribución de permanencia, "no alcanza", asistencia a reuniones por comité; permiso `BOARD` |
| Formularios | `/admin/formularios`, `/admin/formularios/[id]`, `/admin/formularios/[id]/respuestas` | Constructor y bandeja de respuestas |
| Comunidad | `/admin/comites`, `/admin/cargos`, `/admin/permisos` | Comités, catálogo de cargos de comité y cargos de junta por término, permisos técnicos |
| Contenido | `/admin/paginas`, `/admin/cartelera`, `/admin/eventos`, `/admin/eventos/[id]/ediciones`, `/admin/medios`, `/admin/documentos` | Publicación editorial: páginas, cartelera (con Publicar y Despublicar; el push llega en la fase 6 a la misma pantalla), eventos con sus ediciones anidadas, medios con subida directa al bucket ([ADR-033](adr/ADR-033-contenido-y-medios-fase-1.md)); documentos de normativa a medida: subir el PDF con `POST` prefirmado, cargar los artículos desde el JSON del extractor, publicar y despublicar ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)) |
| Participación | `/admin/terminos`, `/admin/ocasiones`, `/admin/ocasiones/[id]` (consola), `/admin/ocasiones/[id]/anfitrion`, `/admin/ledger`, `/admin/rankings`, `/admin/asambleas`, `/admin/cierre` | Términos, ocasiones con QR y aprobaciones, ledger, rankings, requisitos de asambleas, cierre |
| Permanencia | `/admin/permanencia/reglas`, `/admin/permanencia/grupos`, `/admin/permanencia/grupos/[id]`, `/admin/permanencia/evaluaciones`, `/admin/permanencia/cumplimiento`, `/admin/permanencia/cierre` | Tabla general y las 27 tablas de comité, grupos de trabajo con líder, evaluador e miembros, bandeja de evaluaciones, cumplimiento por comité con filtros y export, cierre con propuesta automática y confirmación |
| Comunicaciones | `/admin/plantillas`, `/admin/campanas`, `/admin/mensajes` | Plantillas, campañas por segmento, registro; los anuncios con push se operan en `/admin/cartelera` |
| Sistema | `/admin/sistema/auditoria`, `/admin/sistema/jobs`, `/admin/sistema/importaciones`, `/admin/sistema/exportes`, `/admin/sistema/config`, `/admin/sistema/alias` | Auditoría, outbox y dead letter, importaciones, exportes, configuración, alias legados |

Vista de **líder de comité**: `/admin/comites/[slug]` con roster sin correos y score, proponer ocasiones `DRAFT`, consola y modo anfitrión de sus ocasiones; en `/admin/comites/[slug]/permanencia` edita la tabla de permanencia de su comité dentro del presupuesto, crea las reuniones semanales, pasa asistencia y asigna los puntajes de subcomité, liderazgo, destacado del mes y convivencia. No aprueba puntos ni publica contenido.

Vista de **líder de grupo de trabajo**: opera sus grupos en `/admin/permanencia/grupos/[id]` (miembros, asistencia); no ve el resto del roster.

Vista de **director de GH**: evalúa el desempeño de los miembros de los grupos de su frente en `/admin/permanencia/evaluaciones`; el GH principal evalúa las tareas de nuevos y confirma el cierre.

## API y jobs

| Ruta | Uso |
| --- | --- |
| `GET /api/health` | Prueba Postgres y devuelve versión |
| `GET /api/media/[id]?w=<ancho>` | Elige la variante más grande que no supere `w` (o el original), valida visibilidad y estado y redirige (302) a una URL prefirmada del bucket: 7 días para lo público con `Cache-Control` de 6 días, 10 minutos para lo privado con sesión |
| `POST /api/media/presign` y `POST /api/media/confirm` | ADMIN pide un `POST` prefirmado (JPG, PNG o WebP; 5 KB a 20 MB; 10 minutos), sube directo al bucket y confirma; la confirmación registra el `MediaAsset` en `PENDING` y encola `media.process`, que genera las variantes. Un miembro sin ADMIN solo puede pedirlo con `purpose = "photo"` para su propia foto (privada, hasta 5 MB, clave `photos/<personId>/…`) |
| `POST /api/documentos/presign`, `POST /api/documentos/confirm`, `GET /api/documentos/[id]/pdf` | ADMIN sube un PDF de normativa (hasta 20 MB) a `documents/` y lo confirma; el enlace del lector responde 302 a una URL prefirmada de 10 minutos solo con sesión y documento publicado |
| `POST /api/admin/importaciones/roster` | ADMIN sube el roster (CSV o XLSX, menos de 5 MB): el servidor lo guarda en el bucket, lo parsea, valida y deja la vista previa en un `ImportJob`; confirmar es una server action con step-up |
| `GET /api/mis-datos` | JSON con los datos de la persona con sesión, auditado como `export.self` |
| `GET /sitemap.xml`, `GET /robots.txt` | Solo lo publicado con audiencia pública; con `PUBLIC_INDEXING=false` (staging) robots prohíbe todo y las páginas llevan `noindex` |
| `opengraph-image` de cada segmento público | Cartel tipográfico generado con `next/og` para inicio, páginas, cartelera y cada anuncio, eventos y cada edición, comités y cada comité |
| `POST /api/push/subscribe` | Registra suscripción push del actor |
| `GET /api/export/[tipo]` | CSV/XLSX con step-up cuando hay datos personales |
| Jobs programados: `campaigns`, `reminders`, `prune`, `backup-check` | Corren en el mismo proceso del servicio `web` mediante el scheduler y el outbox; no tienen rutas HTTP |
| `/a/[publicId]`, `/asamblea/[publicId]` | Alias legados de GHPOINTS resueltos por `LegacyAlias` |
