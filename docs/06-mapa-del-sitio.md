# Mapa del sitio

## Público (sin sesión)

| Ruta | Contenido |
| --- | --- |
| `/` | Cartelera, próximo encuentro, acceso a macroeventos, "Entrá a Mi OE" |
| `/la-oe` | Historia desde 1987, misión, visión, "lo hacemos por vos", contacto (Bloque 29 of. 525, oe@eafit.edu.co) |
| `/cartelera` | Anuncios con audiencia pública |
| `/eventos` | Catálogo de eventos permanentes: Días EAFIT, Inventiva, EnFemenino, Subsidios-OE |
| `/eventos/[slug]` | Identidad del evento y sus ediciones publicadas |
| `/eventos/[slug]/[edicion]` | Micrositio de la edición: fechas, lugar, organizadores, inscripción propia (`/f/[slug]`) o enlace externo, galería opcional |
| `/comites` y `/comites/[slug]` | Fichas editoriales con logo, presentación y contacto; el roster nunca es público |
| `/unirse` | Cómo postularse; formulario de postulación si hay convocatoria abierta, prospecto si no |
| `/f/[slug]` | Formularios públicos |
| `/privacidad` | Política de tratamiento de datos vigente |
| `/api/ics/publico.ics` | Calendario de ediciones públicas |
| `/ingresar` | OTP |

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
| `/app/normativa` | Estatutos, reglamento y actas con lector y búsqueda |
| `/app/carnet` | QR personal firmado para acreditación |
| `/app/ajustes` | Sesiones, notificaciones push, preferencias, mis datos editables (foto, celular, correo personal) con consentimiento, solicitud de eliminación |
| `/a/[publicId]` | Check-in de una ocasión; sin sesión redirige a `/ingresar` y vuelve |
| `/api/ics/mi-agenda.ics` | Calendario personal con token |

## Administración (permiso ADMIN; vistas parciales para líderes)

| Sección | Rutas | Contenido |
| --- | --- | --- |
| Inicio | `/admin` | Pendientes del actor, tareas vencidas, ocasiones abiertas, alertas de jobs y respaldo |
| Personas | `/admin/personas`, `/admin/personas/[id]`, `/admin/personas/importar`, `/admin/segmentos`, `/admin/etiquetas`, `/admin/tareas` | CRM: Persona 360, importación del roster por término con vista previa y diff ([13-importacion-del-roster.md](13-importacion-del-roster.md)), segmentos, etiquetas, tareas |
| Organizaciones | `/admin/organizaciones`, `/admin/organizaciones/[id]` | Empresas, unidades de EAFIT, grupos; contactos y patrocinios |
| Pipelines | `/admin/pipelines`, `/admin/pipelines/[id]` | Kanban de admisión, patrocinio y personalizados |
| Solicitudes | `/admin/solicitudes` | Bandeja de solicitudes de miembros; aprobar ejecuta el comando (licencia, baja, cambio de comité, transferencia); rechazar exige motivo |
| Convocatorias | `/admin/convocatorias`, `/admin/convocatorias/[id]` | Convocatorias internas por grupo de trabajo con cupo, ventana y selección de inscritos |
| Junta | `/admin/junta` | Panel de indicadores sin datos personales: retención por semestre, nuevos por comité, distribución de permanencia, "no alcanza", asistencia a reuniones por comité; permiso `BOARD` |
| Formularios | `/admin/formularios`, `/admin/formularios/[id]`, `/admin/formularios/[id]/respuestas` | Constructor y bandeja de respuestas |
| Comunidad | `/admin/comites`, `/admin/cargos`, `/admin/permisos` | Comités, catálogo de cargos de comité y cargos de junta por término, permisos técnicos |
| Contenido | `/admin/paginas`, `/admin/cartelera`, `/admin/eventos`, `/admin/eventos/[id]/ediciones`, `/admin/medios`, `/admin/documentos` | Publicación editorial |
| Participación | `/admin/terminos`, `/admin/ocasiones`, `/admin/ocasiones/[id]` (consola), `/admin/ocasiones/[id]/anfitrion`, `/admin/ledger`, `/admin/rankings`, `/admin/asambleas`, `/admin/cierre` | Términos, ocasiones con QR y aprobaciones, ledger, rankings, requisitos de asambleas, cierre |
| Permanencia | `/admin/permanencia/reglas`, `/admin/permanencia/grupos`, `/admin/permanencia/grupos/[id]`, `/admin/permanencia/evaluaciones`, `/admin/permanencia/cumplimiento`, `/admin/permanencia/cierre` | Tabla general y las 27 tablas de comité, grupos de trabajo con líder, evaluador e miembros, bandeja de evaluaciones, cumplimiento por comité con filtros y export, cierre con propuesta automática y confirmación |
| Comunicaciones | `/admin/anuncios`, `/admin/plantillas`, `/admin/campanas`, `/admin/mensajes` | Anuncios con push, plantillas, campañas por segmento, registro |
| Sistema | `/admin/sistema/auditoria`, `/admin/sistema/jobs`, `/admin/sistema/importaciones`, `/admin/sistema/exportes`, `/admin/sistema/config`, `/admin/sistema/alias` | Auditoría, outbox y dead letter, importaciones, exportes, configuración, alias legados |

Vista de **líder de comité**: `/admin/comites/[slug]` con roster sin correos y score, proponer ocasiones `DRAFT`, consola y modo anfitrión de sus ocasiones; en `/admin/comites/[slug]/permanencia` edita la tabla de permanencia de su comité dentro del presupuesto, crea las reuniones semanales, pasa asistencia y asigna los puntajes de subcomité, liderazgo, destacado del mes y convivencia. No aprueba puntos ni publica contenido.

Vista de **líder de grupo de trabajo**: opera sus grupos en `/admin/permanencia/grupos/[id]` (miembros, asistencia); no ve el resto del roster.

Vista de **director de GH**: evalúa el desempeño de los miembros de los grupos de su frente en `/admin/permanencia/evaluaciones`; el GH principal evalúa las tareas de nuevos y confirma el cierre.

## API y jobs

| Ruta | Uso |
| --- | --- |
| `GET /api/health` | Prueba Postgres y devuelve versión |
| `GET /api/media/[id]` | Valida publicación y audiencia y redirige (302) a una URL prefirmada del bucket: 7 días para lo publicado, 10 minutos para lo privado |
| `POST /api/media/presign` y `POST /api/media/confirm` | ADMIN pide un `POST` prefirmado (tipo y tamaño acotados, 10 minutos), sube directo al bucket y confirma; la confirmación registra el `MediaAsset` y encola las variantes |
| `POST /api/push/subscribe` | Registra suscripción push del actor |
| `GET /api/export/[tipo]` | CSV/XLSX con step-up cuando hay datos personales |
| Jobs programados: `campaigns`, `reminders`, `prune`, `backup-check` | Corren en el mismo proceso del servicio `web` mediante el scheduler y el outbox; no tienen rutas HTTP |
| `/a/[publicId]`, `/asamblea/[publicId]` | Alias legados de GHPOINTS resueltos por `LegacyAlias` |
