# Casa digital de la Organización Estudiantil EAFIT

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Visitantes y estudiantes interesados: conocer la OE, sus comités, sus eventos y el proceso de ingreso.
- Miembros: consultar actividades, participar, acceder al carnet, entender su permanencia por comité y gestionar solicitudes y datos propios.
- Mesas de comité, líderes, evaluadores y Junta: operar las funciones autorizadas para su cargo y semestre. Una persona puede usar Mi OE y Administración con la misma sesión.
- Egresados: su historia puede consultarse según el consentimiento y el alcance documentado; no se presupone acceso activo.

La prioridad relativa de estos públicos para el rediseño de septiembre de 2026 está pendiente de respuesta del usuario. No es una preferencia confirmada.

## Product Purpose

Reunir la presentación pública y la operación de la comunidad en una sola aplicación, con la persona y su historia como eje. Ayudar a participar y gestionar la organización sin perder la relación entre comités, semestres, cargos, actividades y decisiones.

## Positioning

La experiencia representa una organización estudiantil concreta: un miembro puede pertenecer a varios comités, tener responsabilidades distintas y necesitar información de su semestre. La participación y sus puntos, la condición de permanencia, la representación del comité y las decisiones institucionales son conceptos relacionados que deben seguir siendo distinguibles.

## Operating Context

La OE funciona por semestres, con comités de carrera, especiales y de trabajo, mesas directivas, Junta y asambleas. Las actividades incluyen macroeventos, reuniones y encuentros con inscripción o registro de asistencia según corresponda.

La aplicación tiene portal público, Mi OE y Administración. Se usa desde computador y celular; la documentación vigente exige cuidar ambas experiencias. El QR y el carnet forman parte de la participación presencial. No hay una investigación de uso que permita afirmar cuál dispositivo predomina.

## Capabilities and Constraints

- Existen agenda, carnet, GH Points, permanencia por comité, directorios, solicitudes —incluidas excusas—, convocatorias, normativa, ajustes y herramientas administrativas.
- Administración incluye personas, comités por áreas, participación, evaluaciones, presupuestos y avales de evento, contenido, formularios, comunicaciones y CRM de organizaciones.
- El diseño conserva permisos y capacidades por rol, privacidad, sesión, reglas de negocio y decisiones humanas. Una mejora de navegación no amplía autorizaciones.
- La condición del miembro, el progreso calculado y la decisión de cierre no son el mismo estado. La ausencia de datos tampoco demuestra incumplimiento.
- El check-in puntual no acredita por sí solo la duración de asistencia exigida por los documentos de la OE.
- Aliados por comité está pendiente de definición de experiencia. La aprobación de publicidad y los descargos completos requieren orientación hacia el procedimiento vigente; no se presupone un módulo digital ya existente.
- Votación, quórum, actas y mociones, inventario, contratos, subsidios y medición automática de duración mantienen sus exclusiones de alcance. Se evalúan por separado si aparece una necesidad confirmada.
- El brief inicial abarcaba diseño y planificación. Las entregas posteriores del directorio y del podio están documentadas en ADR-069 y ADR-070; el 2026-09-15 se autorizó subir el trabajo a GitHub y preparar staging para probar antes de la promoción posterior a producción. Los otros conceptos de rediseño siguen pendientes de aprobación.

## Brand Commitments

El usuario exige respetar la identidad oficial de la OE. Las fuentes son la Línea Gráfica OE, los Estatutos y el Reglamento Interno 2026 aportados, junto con las adaptaciones digitales aceptadas en la documentación del proyecto.

Se conservan nombre, logos oficiales, paleta institucional, tono cercano con voseo y las decisiones documentadas sobre sustitutos tipográficos por falta de licencias. Administración tiene una adaptación sobria ya aceptada; no se interpreta una pieza promocional del manual como una plantilla obligatoria para todo formulario.

La marca se expresa como servicial, fraternal y versátil. Las comunicaciones sobre obligaciones y decisiones deben ser claras y respetuosas, sin convertir una consecuencia en un recurso de gamificación.

## Evidence on Hand

- [Línea Gráfica OE](</Users/mateo/Downloads/Línea Gráfica OE.pdf>).
- [Estatutos OE 2026](</Users/mateo/Downloads/Estatutos Organización Estudiantil 2026.pdf>).
- [Reglamento Interno OE 2026](</Users/mateo/Downloads/Reglamento Interno Organización Estudiantil 2026.pdf>).
- [Mapa del sitio](docs/06-mapa-del-sitio.md), [marca](docs/07-marca.md), [copy](docs/14-copy-y-textos.md) y [verificación normativa](docs/19-verificacion-normativa-2026.md).
- [Backlog de diseño y contenido](../informes/backlog-diseno-contenido-2026-09-14.md), derivado del assessment de producción del 14 de septiembre de 2026.
- Implementación y revisión visual del portal y Mi OE; recursos de marca existentes en `src/shared/brand` y `public/logos`.

La revisión encontró contenido institucional y fichas públicas pendientes, además de datos del semestre incompletos en las pantallas observadas. No se infiere que todos los comités estén en la misma situación. Las cifras de miembros y comités en documentos históricos deben confirmarse antes de usarlas como afirmaciones actuales. No se inventan fechas, testimonios, patrocinios ni fotografías que aparenten documentar eventos reales.

## Product Principles

1. La persona entiende su siguiente acción y quién tiene la responsabilidad cuando debe esperar.
2. La información distingue dato disponible, dato pendiente, evaluación y decisión confirmada.
3. La misma organización se reconoce en el portal, Mi OE y Administración, con la densidad adecuada para cada trabajo.
4. Las reglas y las fuentes son consultables; una simplificación de lenguaje no modifica su significado.
5. La experiencia aprovecha las capacidades existentes y hace explícitas las dependencias de contenido y operación.

## Accessibility & Inclusion

La base documentada exige contraste AA, uso por teclado, foco visible, estados que no dependan solo del color, movimiento reducido y adaptación a pantallas pequeñas y texto ampliado. Son condiciones de diseño y verificación; este documento no certifica el cumplimiento de toda la app.

## Open Decisions

- Público prioritario para resolver conflictos de jerarquía en el rediseño: consulta pendiente; el borrador puede formular una recomendación sin registrarla como decisión del usuario.
- Dirección de experiencia y composición: se decidirá en la propuesta `shape`; este registro no la aprueba.
- Disponibilidad y responsables de contenidos, logos faltantes, fotografías autorizadas y configuración del semestre: según el backlog.
- No se ha definido un método de implementación ni una preferencia permanente sobre generación de imágenes. Esta etapa no requiere definirlos.

Registro preparado el 14 de septiembre de 2026 a partir de los hechos ya aportados y las decisiones documentadas. No sustituye las ADR ni registra como aprobadas las hipótesis de rediseño.
