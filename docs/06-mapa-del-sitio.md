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

## Mi OE (sesión de integrante)

| Ruta | Contenido |
| --- | --- |
| `/app` | Saludo, agenda del término, mis comités, saldo del término, barra de permanencia, anuncios para integrantes |
| `/app/eventos` | Eventos y ediciones incluyendo audiencia de integrantes |
| `/app/comites` y `/app/comites/[slug]` | Comités con piezas internas y contactos |
| `/app/personas` | Directorio: nombre, foto opcional, comités del término, cargos. Sin correos |
| `/app/gh-points` | Saldo, nivel, movimientos, rankings (nuevos, veteranos, comités), asambleas firmadas/requeridas |
| `/app/permanencia` | Porcentaje del término frente al 60 %, criterio por criterio, cómo sumar más, evaluaciones pendientes, historial |
| `/app/normativa` | Estatutos, reglamento y actas con lector y búsqueda |
| `/app/carnet` | QR personal firmado para acreditación |
| `/app/ajustes` | Sesiones, notificaciones push, preferencias, mis datos, consentimientos, solicitud de eliminación |
| `/a/[publicId]` | Check-in de una ocasión; sin sesión redirige a `/ingresar` y vuelve |
| `/api/ics/mi-agenda.ics` | Calendario personal con token |

## Administración (permiso ADMIN; vistas parciales para líderes)

| Sección | Rutas | Contenido |
| --- | --- | --- |
| Inicio | `/admin` | Pendientes del actor, tareas vencidas, ocasiones abiertas, alertas de jobs y respaldo |
| Personas | `/admin/personas`, `/admin/personas/[id]`, `/admin/personas/importar`, `/admin/segmentos`, `/admin/etiquetas`, `/admin/tareas` | CRM: Persona 360, importación del roster, segmentos, etiquetas, tareas |
| Organizaciones | `/admin/organizaciones`, `/admin/organizaciones/[id]` | Empresas, unidades de EAFIT, grupos; contactos y patrocinios |
| Pipelines | `/admin/pipelines`, `/admin/pipelines/[id]` | Kanban de admisión, patrocinio y personalizados |
| Formularios | `/admin/formularios`, `/admin/formularios/[id]`, `/admin/formularios/[id]/respuestas` | Constructor y bandeja de respuestas |
| Comunidad | `/admin/comites`, `/admin/cargos`, `/admin/permisos` | Comités, cargos por término, permisos técnicos |
| Contenido | `/admin/paginas`, `/admin/cartelera`, `/admin/eventos`, `/admin/eventos/[id]/ediciones`, `/admin/medios`, `/admin/documentos` | Publicación editorial |
| Participación | `/admin/terminos`, `/admin/ocasiones`, `/admin/ocasiones/[id]` (consola), `/admin/ocasiones/[id]/anfitrion`, `/admin/ledger`, `/admin/rankings`, `/admin/asambleas`, `/admin/cierre` | Términos, ocasiones con QR y aprobaciones, ledger, rankings, requisitos de asambleas, cierre |
| Permanencia | `/admin/permanencia/reglas`, `/admin/permanencia/grupos`, `/admin/permanencia/grupos/[id]`, `/admin/permanencia/evaluaciones`, `/admin/permanencia/cumplimiento`, `/admin/permanencia/cierre` | Reglas del término, grupos de trabajo con líder e integrantes, bandeja de evaluaciones, lista de cumplimiento con filtros y export, decisiones de cierre |
| Comunicaciones | `/admin/anuncios`, `/admin/plantillas`, `/admin/campanas`, `/admin/mensajes` | Anuncios con push, plantillas, campañas por segmento, registro |
| Sistema | `/admin/sistema/auditoria`, `/admin/sistema/jobs`, `/admin/sistema/importaciones`, `/admin/sistema/exportes`, `/admin/sistema/config`, `/admin/sistema/alias` | Auditoría, outbox y dead letter, importaciones, exportes, configuración, alias legados |

Vista de **líder de comité**: `/admin/comites/[slug]` con roster sin correos y score, proponer ocasiones `DRAFT`, consola y modo anfitrión de sus ocasiones. No aprueba puntos ni publica contenido.

Vista de **líder de grupo de trabajo**: evalúa el desempeño de los integrantes de sus grupos en `/admin/permanencia/grupos/[id]`; no ve el resto del roster ni el porcentaje de otras personas.

## API y jobs

| Ruta | Uso |
| --- | --- |
| `GET /api/health` | Prueba Postgres y devuelve versión |
| `GET /api/media/[id]` | Valida publicación y audiencia y redirige (302) a una URL prefirmada del bucket: 7 días para lo publicado, 10 minutos para lo privado |
| `POST /api/media/presign` y `POST /api/media/confirm` | ADMIN pide un `POST` prefirmado (tipo y tamaño acotados, 10 minutos), sube directo al bucket y confirma; la confirmación registra el `MediaAsset` y encola las variantes |
| `POST /api/push/subscribe` | Registra suscripción push del actor |
| `GET /api/export/[tipo]` | CSV/XLSX con step-up cuando hay datos personales |
| Jobs programados: `campaigns`, `reminders`, `prune`, `retention`, `backup-check` | Corren en el mismo proceso del servicio `web` mediante el scheduler y el outbox; no tienen rutas HTTP |
| `/a/[publicId]`, `/asamblea/[publicId]` | Alias legados de GHPOINTS resueltos por `LegacyAlias` |
