# ADR-169: El Calendario, los panoramas por rol y la ficha de la persona

- Estado: Aceptada (2026-11-13) (enmendada por ADR-191 y ADR-197)
- Fecha: 2026-11-13
- Desarrolla: [ADR-159](ADR-159-la-operacion-es-de-escritorio.md) (reglas 3 y 5: la estructura y los patrones de escritorio)
- Enmienda: [ADR-034](ADR-034-personas-y-mi-oe-fase-2.md) (la pestaña «Resumen» de la Persona 360) y la regla 15 de [ADR-035](ADR-035-participacion-y-gh-points-fase-3.md) (adónde entra quien no es ADMIN)
- Relacionadas: ADR-036, ADR-058, ADR-072, ADR-190, ADR-167

## Contexto

El plan maestro del rediseño (§5.3 a §5.5) pide tres piezas que atraviesan los espacios de la Operación: un **Calendario** con capas por tipo, un **Panorama** por rol que reemplace el inicio de Administración y una **ficha de registro** al estilo de Attio, empezando por la Persona 360: cabecera con estado y acciones, línea de tiempo al centro y propiedades a la derecha.

Hoy las fechas viven repartidas: las actividades, las asambleas y las sesiones de macroeventos son ocasiones y se ven en `/admin/ocasiones`, y las ediciones de los macroeventos en `/admin/eventos`. El inicio de Administración es solo para ADMIN, y quien no lo es entra derecho a su comité, a su grupo o a la junta (ADR-035 regla 15). La Persona 360 abre en «Resumen», una cuadrícula de datos, y la línea de tiempo vive en otra pestaña.

## Decisión

1. **El Calendario.** `/admin/calendario` muestra la semana (de lunes a domingo) o el mes (seis semanas) en la hora de la OE, con cuatro capas que se prenden y se apagan en la dirección (`capas=`): actividades, asambleas, sesiones de macroeventos y ediciones de macroeventos. Las canceladas no salen. Cada elemento lleva a su pantalla: la consola de la ocasión o la edición. El alcance sigue a ADR-072 y ADR-190:
   - ADMIN y la junta ven todo.
   - La dirección de un comité ve las ocasiones de sus comités.
   - Todos ven las asambleas y las ediciones, que son de toda la OE.

   Las reservas de inventario entran como capa cuando se integre el inventario. El horario preferencial no tiene fechas, así que no es una capa.
2. **Los panoramas por rol.** `/admin` es el Panorama: un tablero con un bloque por cada rol que tiene el actor, con numerales grandes en la letra condensada (ADR-158, plan maestro §5.7):
   - **Junta** (ADMIN o junta): miembros activos, nuevos, en riesgo y asistencia a reuniones; la salud de cada comité y sus cargos obligatorios vacíos; las asambleas de los próximos 30 días.
   - **Gestión humana** (ADMIN): los comités con más gente en riesgo, las evaluaciones pendientes y las evidencias por revisar.
   - **Dirección de comité**: por cada comité que dirige, sus miembros, su asistencia, quién va en riesgo y sus actividades de las próximas dos semanas.
   - **Comunicaciones** (ADMIN): las campañas activas y el cupo diario de correo. La vicepresidencia de comunicaciones es un cargo de la junta y todavía no tiene acceso propio a las campañas; cuando lo tenga, ve este bloque.

   Lo que ADMIN veía en el inicio (tareas, solicitudes, respuestas, tableros, convocatorias y sistema) sigue debajo, como el bloque de la operación general. Enmienda la regla 15 de ADR-035: quien no es ADMIN ya no entra derecho a su comité si tiene algún bloque en el Panorama; si no tiene ninguno (un líder de grupo, el personal de The Games), entra como antes a lo suyo. Los números son agregados sin nombres, como el panel de la junta (ADR-036 regla 12), salvo en la dirección de un comité, que ya ve a su gente.
3. **La ficha de la persona.** La pestaña «Resumen» de la Persona 360 pasa a ser una ficha en dos columnas desde 1280 px: al centro, la actividad reciente (las últimas entradas de la línea de tiempo, con el enlace a la línea completa) y las participaciones por equipo; a la derecha, las propiedades que antes eran la cuadrícula. La cabecera con el estado y las acciones no cambia. Por debajo de 1280 px las dos columnas se apilan.
4. **Cómo se llega.** La barra lateral lleva el Panorama y el Calendario arriba de los espacios, junto a la Mesa, para todos los roles de la Operación, y ⌘K los encuentra como destinos.

## Consecuencias

- **Sin migración.** El Calendario y el Panorama leen lo que ya existe con dos lecturas nuevas por rango de fechas (`listOccasionsBetween` en `participation` y `listEditionsBetween` en `events`).
- **Navegación.** Las pruebas que esperaban la entrada derecha de un rol al comité cambian: la dirección de un comité ahora entra al Panorama.
- **Pruebas.** Unitarias de la cuadrícula (semanas, meses, cambio de año y capas). E2E del Calendario por semana y por mes con sus capas, del Panorama de ADMIN y de la dirección de un comité, y de la ficha con su actividad reciente.

## Enmienda (2026-11-13, ADR-191)

Regla 1: las reservas de inventario son una capa del Calendario, con quien reservó y su comité o macroevento ([ADR-191](ADR-191-el-inventario-entra-al-rediseno.md) regla 4).

## Enmienda (2026-11-13, ADR-197)

Regla 1: el Calendario suma la capa «Junta», con las reuniones de la junta y las fechas clave que registra cada cargo, sincronizada en los dos sentidos con el Google Calendar de la junta ([ADR-197](ADR-197-las-herramientas-de-presidencia.md) regla 6).
