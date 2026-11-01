# Disponibilidad privada de Mi OE

Modo: Operate. Extensión de Mi OE para registrar disponibilidad y comparar horarios dentro de los grupos propios. Implementa ADR-156; no altera el sistema visual global.

THESIS: registrar cuándo puedes reunirte y encontrar coincidencias con quienes pertenecen a tu comité o grupo, con privacidad explícita y guardado controlado.

OWN-WORLD: conserva la navegación de Mi OE, los tokens semánticos de fondo, tinta y borde y los colores institucionales navy y blue. Hereda Sofia Sans Extra Condensed en títulos y Plus Jakarta Sans en cuerpo. La selección combina color con un visto bueno; las coincidencias muestran cantidades.

STORY: registrar la semana habitual del semestre → guardar → escoger un grupo propio → comparar coincidencias → crear o abrir una propuesta con fechas concretas → responder y comparar. Cada modalidad mantiene su respuesta independiente y permite retirarla.

FIRST VIEWPORT: título, explicación de privacidad, semestre y entrada a la semana habitual. Una propuesta abre con su título, grupo y vínculo de retorno, seguido por la respuesta propia. La cuadrícula usa desplazamiento interno con cabecera fija.

FORM: cuadrícula de treinta minutos, lunes a domingo o hasta catorce fechas concretas, siempre en hora de Colombia. Escritorio muestra los días juntos; celular permite escoger un día y marcar por toque o rango. Teclado con flechas y espacio; ratón con selección rectangular. Acciones explícitas de guardar y retirar, confirmaciones y errores que conservan la selección. La comparación presenta personas sin respuesta por separado de las respuestas vacías.

FINISH: pruebas locales con datos sintéticos en 390 y 1440 px, temas claro y oscuro, teclado y axe; revisión independiente. Sin recursos raster nuevos, cambios de tokens globales ni despliegue.

Cierre local: [revisión visual](../review/availability/revision-visual.md) `ship`, [verificación técnica](../review/availability/revision-tecnica.md) y [cierre documental](../review/availability/documentacion.md). La validación local no equivale a un despliegue.
