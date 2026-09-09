# ADR-043: Experiencia administrativa adaptable

- Estado: Aceptada (enmendada por ADR-049)
- Fecha: 2026-09-08
- Relacionadas: ADR-017, ADR-034, ADR-035, ADR-036, ADR-042; 07-marca

## Contexto

La navegación plana acumuló 37 destinos en la cabecera. Las 54 páginas administrativas combinan el kit declarativo con interfaces particulares: modificar únicamente el listado genérico no cubre los flujos de trabajo. Los formularios de archivos subían al seleccionar, los paneles no gestionaban el foco y varios campos bloqueados al editar no llegaban al servidor.

El usuario aprobó un panel sobrio con identidad OE, igual prioridad de computador y celular y alcance exclusivo de Administración.

## Decisión

1. Navegación de 256 px desde 1024 px, agrupada en Comunidad, Gestión, Contenido, Comunicaciones, Participación, Permanencia y Sistema. Debajo, diálogo de navegación. Destino activo único por prefijo más específico con frontera de segmento; Inicio exacto. El servidor filtra los enlaces antes de enviarlos al cliente y conserva guards y redirecciones por rol.
2. Extensión de marca confinada a `.admin-shell`: superficies sin textura, radios de 8–12 px, borde discreto, paleta y fuentes existentes. Sofia Sans Extra Condensed en el título principal de 32/28 px; Plus Jakarta Sans en subtítulos, campos y tablas. Acciones táctiles de al menos 44 px y estilos claros/oscuros. No se alteran tokens globales del portal y Mi OE.
3. El kit sigue siendo declarativo y los datos siguen entrando por APIs públicas de módulos. Las variantes de presentación no cambian esquemas de negocio ni permisos. Búsqueda/filtros/paginación y paneles permanecen expresados en la URL. Una edición inexistente nunca se convierte en un alta; valores inmutables se preservan al serializar y sus invariantes se comprueban en servidor.
4. `ResourcePanel` es un diálogo lateral de hasta 640 px y ocupa toda la pantalla pequeña. Gestiona foco, Escape, fondo inerte, cierre por reemplazo de URL y retorno al disparador. Cabecera y acciones permanecen disponibles durante el desplazamiento. La reautenticación conocida se pide antes de empezar formularios protegidos y se vuelve a verificar al guardar.
5. Formularios con validación asociada, datos conservados ante errores, estado pendiente y prevención de dobles envíos. Multiselección mediante casillas, búsqueda a partir de once opciones y texto monoespaciado solo para código/Markdown/JSON.
6. Una sola representación DOM de cada registro: tabla en escritorio y celdas etiquetadas apiladas en móvil. Matrices comparativas y kanban mantienen desplazamiento local identificado. Las pantallas a medida comparten campos, regiones de tabla, acciones secundarias y envío pendiente.
7. PDF e imágenes se seleccionan antes de confirmar la subida. Se mantienen presign → bucket → confirm y límites actuales. Documentos se gestiona desde su detalle, antes del lector: JSON solo en borrador, publicación con la huella revisada y versión como texto libre. El lector público conserva su cabecera predeterminada.
8. Roster separa archivo/semestre, columnas, revisión y confirmación mediante URL. Las propuestas desmarcadas se conservan durante la reautenticación mediante índices y una huella del conjunto revisado; no se colocan correos en el retorno. Una revisión obsoleta exige revisar las propuestas de nuevo.
9. Los formularios particulares conservan temporalmente el borrador en memoria del layout administrativo cuando una acción vuelve a un error y reconstruye el formulario. Incluye el archivo seleccionado; se descarta al cambiar de operación, completar la navegación o salir de Administración. No usa cookies, almacenamiento persistente ni datos personales en la URL. Publicación y carga de JSON comparten bloqueo de envío. Una huella revisada nula representa explícitamente un documento sin contenido: si otro operador carga contenido, esa revisión ya no autoriza publicarlo.

## Consecuencias

- Se enmienda la presentación del panel de ADR-017 y la aplicación de texturas/títulos de 07-marca para el área administrativa. Las reglas anteriores conservan su texto y siguen aplicando a las demás áreas.
- Se actualizan pruebas que localizaban un `complementary`, controles multiselección nativos o acciones ahora agrupadas. Se prueba el comportamiento semántico nuevo, sin conservar selectores obsoletos.
- No se agregan dependencias visuales, migraciones ni infraestructura. La entrega es local; un despliegue es una operación posterior.

## Verificación

La navegación entre áreas se amplía en [ADR-049](ADR-049-navegacion-entre-mi-oe-y-administracion.md) con un enlace visible a Mi OE en la cabecera.

`admin-responsive.spec.ts` cubre navegación, foco, los 38 destinos, texto al 200 % y capturas a 360/390/768/1440 px. `admin-details-responsive.spec.ts` completa las 16 rutas de detalle con datos sintéticos y axe en los cuatro tamaños, claro/oscuro. Las suites por familia conservan la cobertura de permisos, validación y efectos de negocio. El registro de cierre y resultados efectivos vive en 09-roadmap; no se considera suficiente un cambio de estilos sin comprobar los flujos.
