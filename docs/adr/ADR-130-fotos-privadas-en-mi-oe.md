# ADR-130: Fotos privadas en Mi OE

- Estado: Aceptada
- Fecha: 2026-10-14
- Enmienda: ADR-022
- Relacionadas: ADR-014, ADR-032, ADR-033, ADR-044, ADR-048, ADR-076, ADR-081

## Contexto

Mateo aprobó la maqueta de escritorio y celular de Fotos, con DÍAS 2026 como primera colección, y autorizó implementarla y cargar las fotos. Las carpetas de jugadores se excluyen y los videos quedan para después. El banner aprobado muestra al grupo con camisetas azules de la mesa de DÍAS 2026. Hay miles de archivos y selecciones repetidas; algunas carpetas mezclan días y las fechas de cámara no siempre son válidas.

La entrega genérica de medios privados de ADR-022 redirige a una URL prefirmada: quien copie esa URL puede leerla hasta su vencimiento. Para estas fotos, la condición «solo integrantes» se comprueba también al entregar cada imagen.

## Decisión

1. **Contenido privado separado.** `content` incorpora colección de fotos, álbum, foto y pertenencia a álbum. Una foto tiene una huella SHA-256 del original y puede aparecer en varias selecciones sin duplicar objetos. No son `MediaAsset`, no se sirven por `/api/media` y no tienen audiencia pública.
2. **Mi OE.** Fotos entra en Comunidad del menú Más. La portada conserva el shell y el diseño aprobado: banner DÍAS 2026, Destacadas y Álbumes, proporciones originales y visor. El álbum se pagina en tandas de 48; no se envía el archivo completo al navegador. El visor ofrece teclado, foco, cierre y gestos, y solicita la imagen grande al abrirla.
3. **Bytes autenticados.** `/api/fotos/[id]` resuelve la sesión, la elegibilidad para Mi OE y la autorización viva `MEMBERSHIP`. Comprueba foto en un álbum publicado dentro de una colección publicada y sirve WebP por streaming con `Cache-Control: private, no-store`. No devuelve la URL del bucket. Incluye banner, portadas y miniaturas. Retiro, revocación o despublicación bloquean nuevas lecturas. Una imagen ya recibida puede conservarse.
4. **Preparación local.** El importador recibe origen y destino; omite carpetas cuyo nombre contenga jugador, archivos ocultos y videos. Deduplica por bytes originales, normaliza orientación, convierte HEIC y produce WebP de 480, 960, 1600 y 2400 píxeles sin agrandar ni conservar EXIF/GPS. Los originales se mantienen fuera del repositorio; al bucket llegan copias preparadas. Un archivo ilegible se informa y no se publica como listo.
5. **Carga reanudable.** Manifiesto y progreso privados viven fuera del repo. Claves deterministas y comandos idempotentes auditados con ADMIN conservan procedencia y pertenencias editoriales sin repetir bytes. Colección y álbumes permanecen en borrador hasta comprobar inventario, banner y destacadas. Una colección publicada admite reintentos idénticos; cambios en fotos, pertenencias u orden se rechazan hasta preparar un borrador explícito. Actividad tiene prioridad sobre un día dudoso: no se inventan fechas ni se identifican personas automáticamente.
6. **Operación.** Pruebas y staging usan imágenes sintéticas. Las fotos reales se importan a producción después del CI y promoción del SHA validado. Se comprueban visitante, sesión revocada/vencida, integrante sin autorización, borrador, paginación e idempotencia. Ninguna foto real entra a seeds, fixtures, commits, PRs ni issues.

## Consecuencias

- Enmienda «ningún archivo atraviesa la app» de ADR-022 únicamente para Fotos. Los demás medios conservan su entrega actual.
- Lecturas consumen trabajo y egreso del servicio. Variantes, paginación y carga diferida acotan el costo; se usa el bucket existente sin ampliar el presupuesto automáticamente.
- El respaldo del bucket incluye las variantes privadas; los originales permanecen fuera de la app.
- Esta entrega consulta Fotos y carga por CLI; editor general de álbumes y videos quedan para otro tramo.
