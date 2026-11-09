# Inventario de pantallas del rediseño

Tramo de la ola 0 del rediseño ([ADR-158](adr/ADR-158-la-marca-en-dos-capas.md), [ADR-159](adr/ADR-159-la-operacion-es-de-escritorio.md) y [ADR-160](adr/ADR-160-la-navegacion-de-mi-oe.md)). Hecho el 2026-11-08 sobre `main` en `c2f06fb`, a partir de cada `page.tsx` de `src/app`: su comentario de cabecera, sus componentes y su guard.

## Cómo leerlo

- **Cuántas son.** Hay 124 páginas: 74 de la Operación (`/admin`), 31 de Mi OE (`/app`), 11 del portal y 8 de acceso.
- **Marco y contenido.** Todas cambian de marco en la ola 1: la barra lateral o la barra inferior y la capa funcional, detrás de la bandera por persona. La columna **Ola** dice cuándo se rediseña el **contenido** de cada página.
- **Ola L.** Sin rediseño propio: la página recibe el marco en la ola 1 y los componentes nuevos cuando se usen, sin un tramo aparte.
- **Patrones.**

  | Patrón | Qué es |
  | --- | --- |
  | Kit | `ResourcePage`: tabla, filtros, panel lateral y CSV, armados desde el registro de recursos |
  | Tabla | Tabla a medida, con sus paneles y acciones |
  | Bandeja | Lista de pendientes con panel de decisión |
  | Ficha | Un registro con pestañas o áreas |
  | Formulario | Edición o creación larga |
  | Flujo | Pasos con confirmación, casi siempre con step-up |
  | Consola | Operación en vivo |
  | Tablero | Cifras y accesos |
  | Kanban | Columnas por etapa |
  | Contenido | Para leer |
  | Juego | Una partida |
  | Celular | Pantalla de pie, pensada primero para el teléfono |

- **Uso.** Es una estimación (diario, semanal, en cada reunión, por evento, por semestre u ocasional), y la medición de base la corrige.
- **Quién.** Sale del guard de la página: `requireAdminActor` es ADMIN; el resto, según el rol que exige.

## Resumen

| Ola | Operación | Mi OE | Portal | Acceso | Total |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 | 3 | 1 | 1 | 9 |
| 2 | 40 (26 del kit) | 5 | — | — | 45 |
| 3 | 7 | 6 | — | — | 13 |
| 4 | 3 | — | — | — | 3 |
| 5 | — | 1 | 9 | — | 10 |
| L | 20 | 16 | 1 | 6 | 43 |
| Sin interfaz | — | — | — | 1 | 1 |
| **Total** | **74** | **31** | **11** | **8** | **124** |

## Lo que encontré

1. **La palanca más grande es el kit.** 26 de las 74 páginas de la Operación son `ResourcePage`. Al rehacer `ResourceTable`, `ResourceToolbar` y `ResourcePanel` en R6, con vista dividida, vistas guardadas y lote, las 26 cambian juntas. En la ola 2 son un solo tramo, no 26.
2. **La Mesa ya tiene de dónde leer.** Hay tres bandejas hechas (solicitudes, revisión de evidencias y evaluaciones), y el inicio de `/admin` ya trae un tablero de pendientes de ADMIN (ADR-037 regla 11). La Mesa de la ola 1 las junta y no escribe nada nuevo. Las alertas de cargos obligatorios y de comités en prueba salen de datos que ya existen, no de una página.
3. **El modo de campo ya existe en parte.** El modo anfitrión (`/admin/ocasiones/[id]/anfitrion`), la pantalla del juez de The Games y la jornada de activación ya son pantallas de celular. Pasan al modo de campo con la capa funcional, sin rehacer su flujo.
4. **El Calendario reúne cuatro páginas sueltas**: ocasiones, eventos, asambleas y horario preferencial. Mi OE ya junta ocasiones y ediciones en su agenda (`agendaItems`), y esa lectura sirve de base.
5. **«Te toca» ya tiene sus fuentes en Mi OE**: encuestas, excusas (`/app/solicitudes`), convocatorias, propuestas de reunión, retos con evidencia y los pasos de onboarding. Cada una necesita su lectura de pendientes por persona (ADR-160).
6. **El intersemestral no es tranquilo para todo.** Ahí caen el cierre de puntos y el de permanencia del final de 2026-2, y la admisión, el roster y la activación del inicio de 2027-1. Esas pantallas quedan en L, para no rediseñarlas cerca de su fecha. El marco nuevo les llega detrás de la bandera, así que GH puede quedarse con el anterior durante un cierre.

## Operación (74)

### Mesa: las bandejas que la alimentan

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/solicitudes` | Solicitudes con panel de decisión | ADMIN | Bandeja | 1 | Semanal |
| `/admin/gamificacion/revision` | Revisión de evidencias de retos | ADMIN | Bandeja | 1 | Semanal |
| `/admin/permanencia/evaluaciones` | Evaluaciones de los grupos del actor | Evaluadores, ADMIN | Bandeja | 1 | Por semestre |
| `/admin/tareas` | Tareas del equipo | ADMIN | Kit | 2 | Semanal |

### Panorama

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin` | Inicio con secciones y tablero de pendientes | Todos los roles de la Operación | Tablero | 1 | Diario |
| `/admin/junta` | Agregados del término sin nombres ni correos | Junta, ADMIN | Tablero | 2 | Semanal |

### Personas

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/personas` | Lista de personas | ADMIN | Kit | 2 | Diario |
| `/admin/personas/[id]` | Persona 360 | ADMIN | Ficha | 2 | Diario |
| `/admin/personas/activacion` | Jornada de activación con un QR vivo | Roles de la Operación | Celular | 2 | Por semestre |
| `/admin/personas/importar` | Asistente del roster | ADMIN | Flujo | L | Por semestre |
| `/admin/segmentos` | Segmentos | ADMIN | Kit | 2 | Ocasional |
| `/admin/etiquetas` | Etiquetas | ADMIN | Kit | 2 | Ocasional |
| `/admin/cargos` | Cargos de junta y GH | ADMIN | Kit | 2 | Por semestre |

### Comités

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/comites` | Lista de comités | ADMIN | Kit | 2 | Semanal |
| `/admin/comites/[slug]` | Vista del comité por áreas | Dirección, líder, ADMIN | Ficha | 2 | Semanal |
| `/admin/comites/[slug]/permanencia` | Permanencia del comité | Dirección con `PERMANENCE` | Tabla | 2 | Semanal |

### Calendario

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/ocasiones` | Lista de ocasiones | ADMIN | Kit | 2 | Semanal |
| `/admin/ocasiones/[id]` | Consola de la ocasión: QR, contador y pendientes | Operador de la ocasión | Consola | 2; tiempo real en la 4 | En cada reunión |
| `/admin/ocasiones/[id]/anfitrion` | Modo anfitrión: buscar o escanear el carnet | Operador de la ocasión | Celular | 2 | En cada reunión |
| `/admin/asambleas` | Asambleas del término y cumplimiento por persona | ADMIN | Tabla | 2 | Semanal |
| `/admin/eventos` | Eventos permanentes | ADMIN | Kit | 2 | Ocasional |
| `/admin/eventos/[id]/ediciones` | Ediciones de un evento | ADMIN | Kit | 2 | Ocasional |
| `/admin/eventos/[id]/ediciones/[edicionId]/inscritos` | Inscritos de una edición | ADMIN | Kit | 2 | Por evento |
| `/admin/horario-preferencial` | Horario preferencial | ADMIN | Kit | 2 | Por semestre |

### Admisión

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/formularios` | Formularios | ADMIN | Kit | 2 | Ocasional |
| `/admin/formularios/[id]` | Constructor de un formulario | ADMIN | Formulario | L | Por semestre |
| `/admin/formularios/[id]/respuestas` | Respuestas de un formulario | ADMIN | Kit | 2 | Por semestre |
| `/admin/pipelines` | Pipelines | ADMIN | Kit | 2 | Por semestre |
| `/admin/pipelines/[id]` | Kanban de admisión | ADMIN | Kanban | L | Por semestre |
| `/admin/convocatorias` | Convocatorias internas | ADMIN | Kit | 2 | Ocasional |
| `/admin/convocatorias/[id]` | Inscritos y lista de espera | Líder del grupo, ADMIN | Tabla | L | Por evento |
| `/admin/organizaciones` | Organizaciones aliadas | ADMIN | Kit | 2 | Ocasional |
| `/admin/organizaciones/[id]` | Ficha con contactos, línea de tiempo y patrocinios | ADMIN | Ficha | 2 | Ocasional |

### Comunicación

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/campanas` | Campañas | ADMIN | Kit | 2 | Semanal |
| `/admin/campanas/[id]` | Detalle, destinatarios y envío con step-up | ADMIN | Ficha | 2 | Semanal |
| `/admin/campanas/cupo` | Cupo diario de correo | ADMIN | Tablero | L | Ocasional |
| `/admin/plantillas` | Plantillas | ADMIN | Kit | 2 | Ocasional |
| `/admin/plantillas/[id]` | Vista previa y prueba de una plantilla | ADMIN | Formulario | L | Ocasional |
| `/admin/mensajes` | Mensajes | ADMIN | Kit | 2 | Ocasional |
| `/admin/cartelera` | Anuncios de la cartelera | ADMIN | Kit | 2 | Semanal |
| `/admin/paginas` | Páginas del portal | ADMIN | Kit | 2 | Ocasional |
| `/admin/medios` | Medios con subidor directo | ADMIN | Tabla | L | Ocasional |
| `/admin/documentos` | Documentos | ADMIN | Tabla | 2 | Por semestre |
| `/admin/documentos/[id]` | Un documento | ADMIN | Formulario | 2 | Por semestre |

Los documentos van en la ola 2 porque son la base del empalme entre semestres.

### Participación

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/ledger` | Ledger de GH Points: ajustes y reversiones | ADMIN | Tabla | 2 | Semanal |
| `/admin/rankings` | Rankings del término | ADMIN | Tabla | 3 | Semanal |
| `/admin/cierre` | Cierre de puntos del término | ADMIN | Flujo | L | Por semestre |
| `/admin/gamificacion` | Panel de gamificación | ADMIN | Tablero | 3 | Semanal |
| `/admin/gamificacion/retos` | Retos | ADMIN | Tabla | 3 | Semanal |
| `/admin/gamificacion/retos/nuevo` | Nuevo reto | ADMIN | Formulario | 3 | Semanal |
| `/admin/gamificacion/retos/[id]` | Detalle de un reto | ADMIN | Ficha | 3 | Semanal |
| `/admin/gamificacion/campanas` | Campañas de puntos | ADMIN | Tabla | 3 | Ocasional |
| `/admin/gamificacion/insignias` | Insignias y boosters manuales | ADMIN | Tabla | 3 | Ocasional |
| `/admin/gamificacion/limites` | Topes y activación | ADMIN | Formulario | L | Ocasional |

### Permanencia

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/permanencia/reglas` | Tablas de permanencia, general y por comité | ADMIN | Tabla | L | Por semestre |
| `/admin/permanencia/grupos` | Grupos de trabajo | ADMIN | Kit | 2 | Por semestre |
| `/admin/permanencia/grupos/[id]` | Miembros y evaluadores de un grupo | Líder del grupo, ADMIN | Tabla | L | Por semestre |
| `/admin/permanencia/cumplimiento` | Cumplimiento por persona y comité | ADMIN | Tabla | 2 | Semanal |
| `/admin/permanencia/cierre` | Cierre de permanencia | ADMIN | Flujo | L | Por semestre |

El cumplimiento va en la ola 2 porque es la vista guardada «En riesgo».

### Finanzas y logística

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/presupuestos` | Presupuestos | ADMIN | Kit | 2 | Ocasional |
| `/admin/presupuestos/[id]` | Rubros, aprobaciones y movimientos | ADMIN | Ficha | L | Ocasional |

El inventario todavía no está en `main`, así que no entra en este conteo.

### Macroeventos

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/macroeventos` | Macroeventos | ADMIN | Tabla | L | Por evento |
| `/admin/macroeventos/[slug]` | Vista por áreas de un macroevento | ADMIN | Ficha | L | Por evento |
| `/admin/macroeventos/[slug]/normativa` | Normativa de un macroevento | ADMIN | Formulario | L | Por evento |
| `/admin/eventos/[id]/ediciones/[edicionId]/mesa` | Mesa directiva de una edición | ADMIN | Formulario | L | Por evento |
| `/admin/the-games` | Competencias de The Games | Operación de The Games | Tabla | 4 | Por evento |
| `/admin/the-games/[id]` | Panel del operador | Operación de The Games | Consola | 4 | Por evento |
| `/admin/the-games/[id]/juez` | Pantalla del juez | Jueces | Celular | 4 | Por evento |

### Junta

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/terminos` | Términos | ADMIN | Kit | 2 | Por semestre |
| `/admin/permisos` | Permisos | ADMIN | Kit | 2 | Ocasional |

El panel de la junta vive en Panorama.

### Sistema

| Ruta | Qué es | Quién | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/admin/sistema/politica` | Política de datos | ADMIN | Formulario | L | Ocasional |
| `/admin/sistema/importaciones` | Importaciones del roster | ADMIN | Tabla | L | Por semestre |
| `/admin/sistema/jobs` | Jobs | ADMIN | Tabla | L | Ocasional |
| `/admin/sistema/alias` | Alias | ADMIN | Kit | 2 | Ocasional |

## Mi OE (31)

La columna **Destino** dice dónde queda cada página en la barra nueva (ADR-160).

| Ruta | Qué es | Destino | Patrón | Ola | Uso |
| --- | --- | --- | --- | --- | --- |
| `/app` | Inicio | Hoy | Tablero | 1 | Diario |
| `/app/carnet` | Carnet con QR firmado | Asistencia | Consola | 1 | En cada reunión |
| `/app/ajustes` | Ajustes en seis categorías, avisos incluidos | Yo | Formulario | 1 | Ocasional |
| `/app/agenda` | Ocasiones y ediciones por día | Agenda | Contenido | 2 | Semanal |
| `/app/permanencia` | Permanencia por comité | Yo, con resumen en Hoy | Tablero | 2 | Semanal |
| `/app/gh-points` | Saldo, nivel, movimientos y tableros | Yo | Tablero | 2 | Semanal |
| `/app/gh-points/coleccion` | Colección de insignias | Yo | Contenido | 2 | Semanal |
| `/app/juegos` | Catálogo de juegos | Juegos | Contenido | 2 | Diario |
| `/app/gh-points/retos` | Retos del semestre | Yo, con el próximo en Hoy | Contenido | 3 | Semanal |
| `/app/gh-points/retos/[id]` | Detalle y entrega de un reto | Te toca | Formulario | 3 | Semanal |
| `/app/gh-points/boosters` | Boosters | Yo | Formulario | 3 | Ocasional |
| `/app/comites` | Directorio de comités | Yo | Contenido | 3 | Ocasional |
| `/app/comites/[slug]` | Comité interno | Yo | Contenido | 3 | Semanal |
| `/app/personas` | Directorio de personas | Yo | Contenido | 3 | Ocasional |
| `/app/egresados` | Galería de egresados | Yo | Contenido | 5 | Ocasional |
| `/app/cartelera/[id]` | Un anuncio | Hoy | Contenido | L | Semanal |
| `/app/convocatorias` | Convocatorias abiertas y mis inscripciones | Yo | Contenido | L | Ocasional |
| `/app/convocatorias/[id]` | «Me apunto» | Te toca | Formulario | L | Ocasional |
| `/app/disponibilidad` | Disponibilidad semanal | Yo | Formulario | L | Ocasional |
| `/app/disponibilidad/reuniones/[id]` | Propuesta de reunión | Te toca | Formulario | L | Ocasional |
| `/app/encuesta/[token]` | Encuesta de una ocasión cerrada | Te toca | Formulario | L | Por evento |
| `/app/solicitudes` | Excusas de ocasiones | Te toca | Formulario | L | Ocasional |
| `/app/fotos` | Colecciones de fotos | Yo | Contenido | L | Ocasional |
| `/app/fotos/[collectionSlug]/[albumSlug]` | Un álbum | Yo | Contenido | L | Ocasional |
| `/app/normativa` | Normativa con buscador | Yo | Contenido | L | Ocasional |
| `/app/normativa/[id]` | Lector de un documento | Yo | Contenido | L | Ocasional |
| `/app/juegos/wordle` | Wordle | Juegos | Juego | L | Diario |
| `/app/juegos/panal` | Panal | Juegos | Juego | L | Diario |
| `/app/juegos/color` | Color | Juegos | Juego | L | Diario |
| `/app/juegos/sudoku` | Sudoku | Juegos | Juego | L | Diario |
| `/app/juegos/2048` | 2048 | Juegos | Juego | L | Diario |

Los cinco juegos solo cambian de marco: el tablero de cada uno se queda como está.

## Portal (11)

El portal ya es capa de marca (ADR-158), y su rediseño va con los temas y bloques de la plataforma (P2 y P3 de ADR-085).

| Ruta | Qué es | Patrón | Ola |
| --- | --- | --- | --- |
| `/` | Inicio del portal | Contenido | 5 |
| `/[slug]` | Páginas fijas: La OE, Unirse, Privacidad | Contenido | 5 |
| `/cartelera` | Cartelera pública | Contenido | 5 |
| `/cartelera/[id]` | Un anuncio público | Contenido | 5 |
| `/comites` | Comités publicados | Contenido | 5 |
| `/comites/[slug]` | Ficha editorial de un comité | Contenido | 5 |
| `/eventos` | Catálogo de eventos | Contenido | 5 |
| `/eventos/[slug]` | Un evento y sus ediciones | Contenido | 5 |
| `/eventos/[slug]/[edicion]` | Micrositio de una edición | Contenido | 5 |
| `/f/[slug]` | Formulario propio, público o de miembros | Formulario | L |
| `/marca` | Muestrario de la línea gráfica, solo en desarrollo | Contenido | 1 |

`/f/[slug]` queda en L porque recibe la admisión del inicio de 2027-1, y `/marca` va en la ola 1 porque ahí se documentan las dos capas.

## Acceso (8)

| Ruta | Qué es | Patrón | Ola |
| --- | --- | --- | --- |
| `/a/[publicId]` | Check-in por QR: el destino del botón Asistencia | Celular | 1 |
| `/ingresar` | Ingreso | Formulario | L |
| `/ingresar/codigo` | Código al correo | Formulario | L |
| `/ingresar/paso` | Step-up antes de una acción sensible | Formulario | L |
| `/activar/[token]` | Enlace de activación de la junta | Formulario | L |
| `/autorizacion` | Puerta de autorización de Mi OE | Formulario | L |
| `/baja/[token]` | Dejar de recibir campañas | Formulario | L |
| `/asamblea/[publicId]` | Alias heredado que redirige a `/a/[publicId]` | — | Sin interfaz |

`/activar/[token]` también queda en L: es lo primero que ven los nuevos de 2027-1.
