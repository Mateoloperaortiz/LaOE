# ADR-156: Disponibilidad privada de grupos

- Estado: Aceptada; implementada y verificada localmente
- Fecha: 2026-11-01
- Relacionadas: ADR-004, ADR-014, ADR-032, ADR-036, ADR-046, ADR-081, ADR-110, ADR-143

## Contexto

Mateo pidió una herramienta como When2meet dentro de Mi OE para registrar horarios y compararlos con los miembros de los propios comités, comités especiales y grupos de trabajo o apoyo, **nunca pública**. Confirmó ambas modalidades: semana habitual por semestre y propuestas de reunión con fechas concretas. Confirmó pruebas en las interfaces de guardado/lectura propia, comparación y rechazo de acceso, y revisión contra el estado inicial de la tarea.

## Decisión

1. `availability` conserva respuestas personales y propuestas de reunión. Consulta `people`, `permanence` y `terms` por sus APIs; no crea otro padrón de grupos. La semana habitual tiene siete días, bloques de 30 minutos y hora civil de Colombia. Pertenece a un semestre; no se copia al siguiente.
2. Una propuesta pertenece a un comité o grupo del semestre vigente. Cualquier miembro de ese ámbito puede crearla, con título, hasta catorce fechas del semestre y una ventana diaria en múltiplos de treinta minutos. Las respuestas son independientes de la semana habitual y no confirman una reunión ni crean asistencia. La propuesta deja de aceptar respuestas al terminar su última fecha; el creador puede cerrarla antes.
3. Todas las entradas HTTP exigen sesión válida y autorización de membresía. El dominio vuelve a comprobar persona sin anonimizar, membresía habilitada y autorización vigente. Activos, honorarios y personas en licencia pueden gestionar su propia disponibilidad y consultar sus grupos; es autogestión, no participación acreditable. Crear o cerrar una propuesta requiere membresía activa u honoraria.
4. La comparación exige pertenencia viva al comité activo/en prueba o al grupo en el semestre actual. El líder nombrado de un grupo también forma parte de él; ser solo evaluador, ADMIN o BOARD no habilita horarios ajenos. La población incluye únicamente personas habilitadas y con autorización vigente. Cada lectura resuelve de nuevo el alcance, sin aceptar listas de personas del navegador. Un ámbito inexistente o ajeno produce la misma respuesta. Comités especiales usan sus pertenencias existentes; todos los tipos de `WorkGroup` comparten el mecanismo.
5. Solo se envían al navegador nombres, estado de respuesta y disponibilidad del ámbito autorizado. No se exponen correos ni otros datos del perfil. La comparación diferencia falta de respuesta de respuesta sin bloques libres, muestra conteos y permite consultar coincidencias por bloque. El horario propio solo se modifica a partir del actor de sesión. Una revisión opaca nueva en cada guardado evita que una pestaña sobrescriba silenciosamente otra; no se reutiliza después de retirar y volver a registrar la respuesta.
6. `/app/disponibilidad` es dinámica, privada, sin indexación ni caché compartida. Las acciones autentican por sí mismas. No hay endpoint público, enlace secreto, iframe de When2meet, exporte de grupo, feed ICS ni almacenamiento local de horarios. El service worker conserva su política sin caché. La privacidad se decide en el servidor; ocultar enlaces no constituye autorización.
7. La auditoría registra la operación y el número de bloques, sin copiar horarios ni títulos. `Mis datos` incluye respuestas y propuestas propias. La anonimización borra respuestas y elimina la atribución y sustituye el título de las propuestas por el outbox; las lecturas excluyen inmediatamente a la persona anonimizada. El titular puede retirar su respuesta.
8. La UI conserva el sistema de Mi OE. La cuadrícula permite marcar por clic, teclado o arrastre con ratón, con alternativa de rango para celular. El guardado es explícito, conserva la selección ante un fallo y comunica errores, cambios pendientes y confirmación. Todo texto se registra en `docs/14-copy-y-textos.md`.

## Consecuencias

No se comparten horarios entre grupos sin una pertenencia común ni se concede acceso global a la administración. Una persona que sale de un grupo pierde acceso a sus comparaciones y deja de aparecer en ellas. Las propuestas históricas no conceden acceso al semestre anterior. La zona horaria fija evita comparar horas de distintos husos como si coincidieran; esta entrega no sincroniza calendarios externos.

Referencia funcional: [When2meet](https://www.when2meet.com/). La herramienta vive en la casa; no envía disponibilidad a ese servicio.
