# ADR-159: La Operación es de escritorio

- Estado: Propuesta
- Fecha: 2026-11-06
- Enmienda, al aceptarse: [ADR-043](ADR-043-experiencia-administrativa.md) («igual prioridad de computador y celular», reglas 1 y 4)
- Relacionadas: ADR-035, ADR-036, ADR-043, ADR-049, ADR-058, ADR-072, ADR-083, ADR-158, ADR-160

## Contexto

La Administración tiene 74 páginas y 48 destinos repartidos en ocho grupos (`src/app/admin/_kit/nav.ts`): Comunidad, Gestión, Contenido, Comunicaciones, Participación, Gamificación, Permanencia y Sistema. ADR-043 la diseñó con igual prioridad para el computador y el celular: una barra lateral de 256 px desde 1024 px, un panel lateral de hasta 640 px que ocupa toda la pantalla pequeña y tablas que se apilan en celdas.

La operación de la OE se hace en el computador: cargar el roster, activar personas, revisar evidencias, evaluar y cerrar la permanencia, armar campañas y presupuestos. Ese trabajo pide comparar muchos registros, abrir varias pestañas, usar el teclado y actuar sobre varios elementos a la vez, y diseñar cada pantalla también para el celular recorta esas herramientas. En cambio, lo que se hace de pie sí pasa en el celular: la consola de una ocasión, escanear carnets, entregar y recibir inventario.

Además, cada rol encuentra su trabajo en páginas sueltas. No hay un lugar que junte lo pendiente: solicitudes, evidencias por revisar, evaluaciones, tareas de GH o alertas de un cargo obligatorio sin titular.

El 2026-11-06 Mateo pidió pensar la parte operativa de la OE como una experiencia de escritorio más que móvil. Unas maquetas con datos ficticios del mismo día probaron la Mesa, una tabla con vista dividida, la Persona 360 y la consola en el celular.

## Decisión

1. **Escritorio primero.**

   | Ancho | Cómo se ve |
   | --- | --- |
   | 1280 px o más | Es el ancho de referencia: barra lateral, lista y detalle a la vez |
   | De 1024 a 1279 px | La barra lateral se compacta a iconos y el detalle se abre como panel |
   | Menos de 1024 px | Todo sigue funcionando, sin diseño propio, salvo el modo de campo (regla 6) |

   El área conserva su ruta, `/admin`. Su nombre visible pasa a ser «Operación», con su texto en el catálogo.
2. **Estructura.**
   - **Barra lateral:** mide 240 px y se recoge a 64. Lleva arriba la Mesa, el Panorama y el Calendario; después, los Favoritos (vistas y comités fijados), los espacios de trabajo y los Recientes.
   - **Barra superior:** la paleta ⌘K, el botón «Crear», el contador de la Mesa, la cuenta y el enlace a Mi OE ([ADR-049](ADR-049-navegacion-entre-mi-oe-y-administracion.md)).
   - **Espacios:** reordenan por trabajo los ocho grupos de hoy:

     | Espacio | Qué reúne |
     | --- | --- |
     | Personas | Personas y Persona 360, segmentos, etiquetas, importar, activación, cargos |
     | Comités | Comités y, dentro de cada uno, sus áreas ([ADR-058](ADR-058-direccion-del-comite-por-areas.md)) |
     | Admisión | Formularios, pipelines, convocatorias, organizaciones |
     | Comunicación | Campañas, plantillas, mensajes, cartelera, páginas, medios, documentos |
     | Participación | Ledger, rankings, gamificación, cierre de puntos |
     | Permanencia | Reglas, grupos, evaluaciones, cumplimiento, cierre |
     | Finanzas y logística | Presupuestos y, cuando se integre, el inventario que está en revisión |
     | Macroeventos | Macroeventos, The Games |
     | Junta | Junta, términos, permisos |
     | Sistema | Política, importaciones, jobs, alias |

   - **Acceso:** cada rol ve solo sus espacios, con las reglas de hoy (ADR-035 regla 15, ADR-036 regla 10, ADR-058).
   - **Lista de destinos:** sigue siendo una sola, en `nav.ts` ([ADR-083](ADR-083-lo-compartido-no-vive-en-la-carpeta-de-una-pantalla.md)).
3. **Mesa.**
   - **Qué junta:** lo que le toca al actor, venga del módulo que venga: solicitudes, evidencias por revisar, evaluaciones pendientes, tareas de GH y alertas, como un cargo obligatorio sin titular, un comité en prueba o, cuando exista el inventario, un préstamo vencido.
   - **Cómo se resuelve:** cada elemento se abre en el detalle y se resuelve con la misma orden y la misma auditoría que en su pantalla de origen. La Mesa no tiene escrituras propias.
   - **De dónde lee:** de la API pública de cada módulo (`index.ts` y `admin.ts`), siempre dentro del alcance del actor ([ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md)).
4. **Panorama y Calendario.**
   - **Panorama** reemplaza el inicio de `/admin` con un tablero por rol: junta, GH, dirección de comité, Comunicaciones y Logística.
   - **Calendario** muestra en capas ocasiones, eventos, asambleas, ediciones de macroeventos, horario preferencial y, cuando exista, las reservas de inventario. Las páginas de ocasiones, eventos, asambleas y horario preferencial pasan a colgar de él.
   - **Tareas, solicitudes y revisión de evidencias** conservan sus páginas y además salen en la Mesa.
   - **El contenido exacto** de cada uno se fija en el tramo que lo construye.
5. **Patrones de escritorio**, construidos como componentes base del tramo R6:
   - **Tabla de trabajo.** Cabecera fija, columnas que se eligen, orden y filtros como fichas. Densidad cómoda, con filas de 40 px, o compacta, de 32 px. Selección múltiple con barra de acciones en lote y exportación a CSV.
   - **Vistas guardadas.** Filtros, orden y columnas con un nombre, personales o compartidos con un rol. La vista viaja en la URL (ADR-043 regla 3) y se guarda por persona.
   - **Vista dividida.** Desde 1280 px, el `ResourcePanel` deja de ser un diálogo y pasa a ser un panel junto a la lista, sin taparla, y la URL lleva el registro abierto. Por debajo de 1280 px se conserva el diálogo de ADR-043 regla 4.
   - **Ficha de registro**, empezando por la Persona 360: cabecera con estado y acciones, la línea de tiempo al centro (el registro de eventos de `crm`) y las propiedades a un lado.
   - **Acciones en lote** con vista previa y confirmación. Cada elemento pasa por su orden de siempre y queda en la auditoría.
   - **Edición en línea**, solo para campos simples, con la misma orden y la misma auditoría.
   - **Atajos de teclado:**

     | Tecla | Qué hace |
     | --- | --- |
     | `?` | Muestra el mapa de atajos |
     | `G` y luego la letra del espacio | Va a ese espacio |
     | `C` | Crea algo |
     | `/` | Busca en la tabla |
     | `J` y `K` | Se mueven en la lista |
     | `Enter` | Abre el registro |
     | `Esc` | Cierra |
     | `X` | Selecciona |
     | `E` | Edita |
     | `⌘Enter` | Guarda |

     Ningún atajo actúa dentro de un campo de texto, y todo lo que hace un atajo también se hace con un clic.
   - **Pantalla de presentación.** La consola de una ocasión, una asamblea o la tabla de The Games se abren en otra ventana, para el proyector.
6. **Modo de campo.**
   - **Qué cubre:** en el celular, la Operación tiene pantallas propias solo para lo que se hace de pie: la consola de la ocasión como anfitrión, escanear un carnet, entregar y recibir inventario cuando exista, aprobar una solicitud y ver la tabla de The Games.
   - **Cómo se ve:** zonas táctiles de 44 px y la acción principal abajo, al alcance del pulgar.
7. **Marca.** La Operación usa la capa funcional de [ADR-158](ADR-158-la-marca-en-dos-capas.md). La letra condensada solo entra en los numerales del Panorama y en las pantallas de presentación.
8. **Fuera de esta ADR**, cada una con su propia ADR:
   - **La paleta ⌘K para todos los roles**, con búsqueda dentro del alcance de cada uno, porque enmienda ADR-072.
   - **El registro sin señal** del modo de campo, que sigue en el backlog.

## Consecuencias

- **Alcance.** No cambian los permisos, los guards ni el dominio. Cada página sigue exigiendo su rol en el servidor, y la Mesa y el Panorama solo leen.
- **Persistencia.** Las vistas guardadas y la Mesa con estado de leído sí necesitan guardar datos nuevos: cada una entra con su migración y su tramo.
- **Pruebas.** Las E2E de la Operación se corren a 1280 px y las del modo de campo, en celular. Se conservan las de teclado y texto al 200 % (ADR-049).
- **Transición.** Se migra por espacios, detrás de una bandera por persona: primero la junta y GH, y después todos. Un espacio migrado retira su pantalla anterior en el mismo semestre.
- **Al aceptarse**, ADR-043 suma esta ADR a las que la enmiendan en su estado y cierra con su sección «Enmienda».
