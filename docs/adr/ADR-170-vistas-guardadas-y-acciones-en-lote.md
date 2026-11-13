# ADR-170: Vistas guardadas y acciones en lote

- Estado: Propuesta
- Fecha: 2026-11-13
- Desarrolla: [ADR-159](ADR-159-la-operacion-es-de-escritorio.md) (regla 5) y [ADR-167](ADR-167-patrones-de-escritorio-de-la-operacion.md) (regla 4, la tabla del kit)
- Relacionadas: ADR-012, ADR-014, ADR-017, ADR-047, ADR-082, ADR-118

## Contexto

El plan maestro (§5.4) pide dos patrones más para las tablas de la Operación: **vistas guardadas** («Nuevos sin activar», «En riesgo en GEMIS»), para ti o compartidas con tu rol, y **acciones en lote con vista previa**, como ya hace la importación del roster. ADR-167 dejó la vista de una tabla entera en la dirección (búsqueda, filtros y `columnas=`), así que guardar una vista es guardar esa dirección. La tabla de trabajo de R6-B ya trae la casilla por fila, «seleccionar todas» y la barra de lote, pero nada las usaba en el kit.

## Decisión

1. **Una vista guardada es una dirección con nombre.** Vive en `saved_view`, en el módulo `system`: quién la guardó, la tabla (su ruta), el nombre, la dirección sin el registro abierto ni la página, y si se comparte.
   - Una vista propia solo la ve quien la guardó. Una compartida la ven todos los que pueden abrir esa tabla; la tabla vuelve a exigir su permiso al abrirla, así que compartir no da acceso a nada.
   - Solo quien la guardó la borra. Hasta 20 por persona y por tabla, con nombre único en la tabla.
   - No guarda filas ni resultados: si los datos cambian, la vista muestra lo de hoy.
   - Guardarla y borrarla dejan su fila de auditoría. Al anonimizar a una persona se borran sus vistas, también las que compartió (ADR-014).
2. **Dónde se usan.** La barra de la tabla del kit lleva el menú «Vistas» con las propias y las compartidas, la que coincide con lo que se mira marcada, y el formulario para guardar la actual. La estrella de Favoritos (ADR-167 regla 3) también fija una vista, porque fija la dirección.
3. **Acciones en lote con vista previa.** Un recurso del kit declara cuáles de sus acciones de fila se pueden hacer en lote (`batchActions`). Su tabla suma la casilla por fila, «seleccionar todas» y la barra de lote, con X para marcar desde el teclado.
   - Elegir una acción abre primero la **vista previa**: cuántas filas marcadas, a cuáles aplica y a cuáles no, con su nombre.
   - Confirmar corre la misma acción de fila, una por una, con su propio comando, su auditoría y el actor con su IP (ADR-082). Una que falla no frena a las demás: al final la pantalla dice cuántas se hicieron y cuántas no.
   - Hasta 100 filas por lote, lo mismo que cabe en una página larga.
   - Empieza con «Marcar como hecha» en las tareas. Otra acción entra al lote cuando su recurso la declara.

## Consecuencias

- **Migración aditiva.** Una tabla nueva, `saved_view`, con su índice único por persona, tabla y nombre.
- **Política de datos.** Una vista guarda una dirección, que puede llevar lo que se buscó, por ejemplo un nombre. La próxima versión de la política (ADR-047) la nombra junto con los avisos de Mi OE; queda en [11-contenido-pendiente](../11-contenido-pendiente.md).
- **Contrato del kit.** `ResourceDefinition` suma `batchActions`, opcional.
- **Pruebas.** Integración de guardar, listar, compartir y borrar vistas, del borrado al anonimizar y del lote con una fila que no aplica. E2E de guardar y abrir una vista, y del lote con su vista previa.
