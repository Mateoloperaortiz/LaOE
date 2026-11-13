# ADR-167: Patrones de escritorio de la Operación

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Desarrolla: [ADR-159](ADR-159-la-operacion-es-de-escritorio.md) (regla 5, «Patrones de escritorio»)
- Amplía: [ADR-190](ADR-190-la-paleta-por-rol-con-alcance.md) (la paleta también hace)
- Relacionadas: ADR-017, ADR-043, ADR-072, ADR-082, ADR-161, ADR-164

## Contexto

ADR-159 regla 5 dejó la lista de patrones de escritorio que la Operación necesita, y el plan maestro del rediseño (§5.4 y anexo A) los detalla. La ola 1 construyó la tabla de trabajo, la vista dividida y los atajos de una lista (R6-B), la Mesa (O2) y ⌘K por rol (K1). Al repartir las piezas sin ola, el 2026-11-13, quedaron para la ola 2: elegir columnas, filtros como fichas, CSV desde la tabla, edición en línea, el mapa de atajos con las teclas que faltan, el botón «Crear», Favoritos y Recientes, ⌘K con acciones, e imprimir y PDF.

Casi todos son presentación sobre lo que ya existe. Tres piden una regla: dónde viven los Favoritos, qué puede hacer la paleta y cómo se edita en línea sin abrir un segundo camino de escritura.

## Decisión

1. **Atajos de teclado.** La Operación tiene un mapa de atajos que se abre con `?`, con las teclas del anexo A del plan maestro:
   - ⌘K busca, va y hace; `?` muestra el mapa; G y una letra van a un espacio (M Mesa, I Inicio, P Personas, C Comités, A Admisión, O Comunicación, T Participación, R Permanencia, F Finanzas y logística, E Macroeventos, J Junta y S Sistema); C crea; `/` busca en la tabla; J y K mueven, X marca la fila, Enter abre y Esc cierra; E edita el registro con foco o el abierto; ⌘Enter guarda el formulario.
   - Un atajo de una letra no actúa mientras se escribe, con una tecla modificadora ni con un diálogo abierto. ⌘Enter sí, porque guardar es justo lo que se hace en el panel de edición.
   - Todo lo que hace un atajo también se hace con un clic: el atajo aprieta el mismo control. El mapa solo muestra los espacios que el actor ve.
2. **«Crear» y las acciones de ⌘K.** La barra superior lleva un botón «Crear» con lo que el actor puede crear, dentro de su alcance, y la paleta ofrece lo mismo como acciones («Crear: Ocasión», «Emitir enlace de activación»):
   - ADMIN: cada recurso del kit que tiene alta, y el enlace de activación.
   - La dirección de un comité con la capacidad de ocasiones: una ocasión de su comité.
   - La junta: el enlace de activación.

   Una acción lleva a la pantalla que ya hace la tarea, con su formulario abierto. La paleta no escribe: cada pantalla vuelve a exigir su permiso, como ya pide ADR-190. Sin nada que crear, el botón no aparece. C abre el «Nuevo» de la pantalla actual y, si no tiene, el menú «Crear».
3. **Favoritos y Recientes.** La estrella de la barra superior fija la pantalla que se mira, con sus filtros pero sin el registro abierto ni la página. La barra lateral muestra hasta 8 favoritos y las últimas 5 pantallas visitadas, sin repetir la Mesa ni el Inicio. Viven en el navegador de cada persona (`localStorage`), como la barra recogida (ADR-159 regla 2): son una comodidad, no un dato, no viajan a la casa y no se comparten. Sin almacenamiento no aparecen. Las vistas guardadas, que sí se comparten con un rol, van en la base con su propia decisión.
4. **La tabla del kit.** Las listas del admin kit (ADR-017) suman:
   - **Columnas a elección.** Las columnas visibles van en la dirección (`columnas=a,b`), así que se comparten con el enlace, se conservan al buscar, filtrar y paginar, y una vista guardada las podrá llevar. Sin el parámetro se ven todas, y siempre queda al menos una.
   - **Filtros como fichas.** Cada filtro activo, y la búsqueda, se muestra como una ficha que se quita sola, sin tocar las demás.
   - **CSV desde la tabla.** El CSV sale con la búsqueda y los filtros de la tabla, como ya hacía, y sigue con el tope de filas y la auditoría de ADR-118 y ADR-119. Lleva todos los campos del exporte, no solo las columnas visibles: el exporte de cada recurso es su contrato.
   - **Teclado.** J, K y X funcionan en las filas, como en la tabla de trabajo de R6-B.
5. **Edición en línea.** Un recurso declara qué columnas se editan en la celda (`inlineEdit`, columna → campo), y solo campos simples: texto, número, fecha, correo, enlace o lista de opciones. Guardar en la celda arma el mismo formulario del panel con los valores guardados y el campo nuevo, lo valida con el mismo esquema y llama al mismo `update` del recurso. Por eso la auditoría, el actor con su IP (ADR-082) y el paso de seguridad (ADR-010) son los de siempre. Un error se muestra en la celda y nada se guarda a medias.
6. **Imprimir y PDF.** Las pantallas que se imprimen tienen un botón «Imprimir» y una hoja de impresión que oculta el marco de la Operación: barra lateral, barra superior, botones y formularios. El PDF es «Guardar como PDF» del diálogo de impresión del navegador: la casa no genera archivos. Empieza por la lista de asistencia de una ocasión. Las actas son documentos PDF de la biblioteca de documentos y ya se descargan tal cual.

## Consecuencias

- **Sin migración.** Nada de esto toca la base: los favoritos viven en el navegador y las columnas en la dirección.
- **Contrato del kit.** `ResourceDefinition` suma `inlineEdit`, opcional. Un recurso que no lo declara queda igual.
- **Accesibilidad.** El mapa es un diálogo con su título. Las fichas son enlaces con su nombre completo («Quitar filtro: Estado»). La celda en edición lleva su etiqueta y devuelve el foco al terminar.
- **Pruebas.** Unitarias de la lógica pura: la tecla de cada atajo, la dirección que se fija y las listas de favoritos y recientes. Integración de la edición en línea, con el mismo `update` y su auditoría, y del campo que no se declaró. E2E del mapa, de ir a un espacio con G, de «Crear», de la estrella, de columnas y fichas, y de la celda.
