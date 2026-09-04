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
| `/app/comites` y `/app/comites/[slug]` | Comités con piezas internas y contactos; cada comité tiene su cartelera interna (anuncios con `committeeId`, como el destacado del mes) |
| `/app/personas` | Directorio: nombre, foto opcional, comités del término con el cargo en cada uno ("General de A3"), cargos de junta. Sin correos |
| `/app/egresados` | Galería de egresados por año de salida: nombre, foto con consentimiento, comités, cargos y años en la OE; solo quienes dieron consentimiento `MEMORIAL` |
| `/app/solicitudes` | Mis solicitudes: licencia, retiro voluntario, cambio de comité, transferencia interna; estado y respuesta de GH |
| `/app/convocatorias` | Convocatorias internas abiertas (GT, GAP, GAP OE, barra brava, tareas de nuevos): inscripción directa al grupo, cupo y cierre |
| `/app/gh-points` | Saldo, nivel y puntos para el siguiente, movimientos, rankings (nuevos, veteranos, comités: top 10 con nombres más el puesto propio), asambleas del semestre firmadas y requeridas |
| `/app/permanencia` | Resultado por cada comité frente a su umbral (60, 80 o 70 %) calculado en vivo mientras el semestre está abierto y congelado al cerrar, bloque general y bloque del comité criterio por criterio con lo logrado y lo que aún es posible, cómo sumar más, asambleas obligatorias, evaluaciones pendientes, avisos (mitad de semestre, tres semanas antes, no alcanza, asamblea obligatoria), onboarding si es nuevo, historial; selector de semestre |
| `/app/normativa` y `/app/normativa/[id]` | Estatutos, reglamento y actas: lista con buscador sobre los artículos y lector con índice por capítulo; el PDF firmado se abre por enlace prefirmado |
| `/app/carnet` | QR personal firmado para acreditación (token de 24 horas) |
| `/app/ajustes` | Una sola página con las secciones de T-133: mis datos (foto, celular y correo personal con consentimiento), notificaciones (fase 6), sesiones, consentimientos, mis datos y privacidad (descargar mis datos, solicitar eliminación) |
| `/api/mis-datos` | JSON con todo lo que la OE guarda sobre la persona con sesión; auditado |
| `/a/[publicId]` | Check-in de una ocasión: título, ventana, botón único de registro, campo del código rotativo si aplica (prellenado desde `?c=`); sin sesión redirige a `/ingresar` (que muestra T-100) y vuelve; si el `publicId` no existe consulta `LegacyAlias` |
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
| Junta | `/admin/junta` | Panel de indicadores sin datos personales por semestre: retención, nuevos por comité, distribución de permanencia por comité, "no alcanza", asistencia a reuniones por comité, integraciones y asambleas; CSV agregado sin step-up; ADMIN o permiso `BOARD` ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |
| Formularios | `/admin/formularios`, `/admin/formularios/[id]`, `/admin/formularios/[id]/respuestas` | Constructor y bandeja de respuestas |
| Comunidad | `/admin/comites`, `/admin/cargos`, `/admin/permisos` | Comités, catálogo de cargos de comité y cargos de junta por término, permisos técnicos |
| Contenido | `/admin/paginas`, `/admin/cartelera`, `/admin/eventos`, `/admin/eventos/[id]/ediciones`, `/admin/medios`, `/admin/documentos` | Publicación editorial: páginas, cartelera (con Publicar y Despublicar; el push llega en la fase 6 a la misma pantalla), eventos con sus ediciones anidadas, medios con subida directa al bucket ([ADR-033](adr/ADR-033-contenido-y-medios-fase-1.md)); documentos de normativa a medida: subir el PDF con `POST` prefirmado, cargar los artículos desde el JSON del extractor, publicar y despublicar ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)) |
| Participación | `/admin/terminos`, `/admin/ocasiones`, `/admin/ocasiones/[id]` (consola), `/admin/ocasiones/[id]/anfitrion`, `/admin/ledger`, `/admin/rankings`, `/admin/asambleas`, `/admin/cierre` | Términos (kit); ocasiones por el kit con filtros y acciones Abrir y Cerrar; consola a medida con QR (código rotativo embebido), contador en vivo por polling, pendientes con Aprobar y Rechazar, alta manual, ciclo de vida y score por comité; modo anfitrión móvil con cámara y búsqueda por nombre; ledger con ajustes y reversiones; rankings por término; cumplimiento de asambleas y ajuste del requisito; cierre de puntos con step-up y `TermStanding` ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| Permanencia | `/admin/permanencia/reglas`, `/admin/permanencia/grupos`, `/admin/permanencia/grupos/[id]`, `/admin/permanencia/evaluaciones`, `/admin/permanencia/cumplimiento`, `/admin/permanencia/cierre` | Tabla general y las 27 tablas de comité en una vista con sumas frente al nominal, copiar del semestre anterior, tabla de referencia, comentario y bloqueo por tabla, vista previa del impacto; grupos de trabajo por el kit y detalle a medida con líder, evaluadores, miembros e importación CSV, siembra de los comités de trabajo; bandeja de evaluaciones por evaluador con ventana; cumplimiento por persona y comité con filtros, recálculo y export con step-up; cierre con propuestas derivadas, confirmación por persona o en bloque y aplicación con step-up por job reanudable ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |
| Comunicaciones | `/admin/plantillas`, `/admin/campanas`, `/admin/mensajes` | Plantillas, campañas por segmento, registro; los anuncios con push se operan en `/admin/cartelera` |
| Sistema | `/admin/sistema/auditoria`, `/admin/sistema/jobs`, `/admin/sistema/importaciones`, `/admin/sistema/exportes`, `/admin/sistema/config`, `/admin/sistema/alias` | Auditoría, outbox y dead letter, importaciones, exportes, configuración, alias legados |

Vista de **líder de comité**: `/admin/comites/[slug]` con roster sin correos y score, crear ocasiones de su comité (abre por sí mismo solo las de 0 puntos; las que dan GH Points esperan a un ADMIN), crear la serie semanal de reuniones, consola y modo anfitrión de sus ocasiones; en `/admin/comites/[slug]/permanencia` edita la tabla de permanencia de su comité mientras GH no la bloquee (copiar del semestre anterior, suma frente al nominal), asigna los puntajes de su tabla (subcomité, liderazgo o destacado; convivencia con observación obligatoria si baja), nombra al destacado del mes y ve el progreso de sus miembros; las reuniones semanales y la asistencia siguen en `/admin/comites/[slug]`. No aprueba puntos ni publica contenido.

Vista de **líder de grupo de trabajo**: opera sus grupos en `/admin/permanencia/grupos/[id]` (miembros por nombre o por CSV); no ve el resto del roster ni evalúa. El acceso se deriva de `work_group.leaderPersonId`.

Vista de **evaluador** (director de GH del frente, GH principal para las tareas de nuevos, capitán y DT del Athletic, GH de turno para la barra brava): evalúa el desempeño de los miembros de sus grupos en `/admin/permanencia/evaluaciones` dentro de la ventana (dos semanas antes del cierre del término); el acceso se deriva de `work_group_evaluator`. Confirmar y aplicar el cierre es de ADMIN.

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
| `GET /api/export/[tipo]` | CSV con step-up cuando hay datos personales; desde la fase 3 también `ocasiones`, `check-ins`, `ledger`, `rankings` y `asambleas` |
| `GET /api/ocasiones/[id]/live` | Contador en vivo de la consola (aprobados, pendientes, por comité, últimos check-ins, código rotativo vigente y QR regenerado); ADMIN o líder del comité de la ocasión; sin caché |
| Jobs programados: `campaigns`, `reminders`, `prune`, `backup-check` | Corren en el mismo proceso del servicio `web` mediante el scheduler y el outbox; no tienen rutas HTTP |
| `/asamblea/[publicId]` | Alias legado de GHPOINTS: resuelve `LegacyAlias` y redirige a `/a/[publicId]`; `/a/[publicId]` es la misma URL en los dos sistemas y solo consulta el alias para los `publicId` retirados |
