# ADR-089: The Games: competencia por equipos de Días EAFIT

- Estado: Aceptada (enmendada por ADR-093 y ADR-094); implementación en curso
- Fecha: 2026-09-23
- Relacionadas: ADR-002, ADR-007, ADR-011, ADR-012, ADR-013, ADR-014, ADR-020, ADR-036, ADR-047, ADR-058, ADR-064, ADR-072, ADR-075, ADR-082, ADR-085, ADR-090, ADR-091
- Enmienda: ADR-011 (el cargo de Dirección de The Games habilita, por datos, la operación de la competencia de su edición), ADR-064 (esa entrega no ampliaba permisos por cargo: este lo hace, con alcance cerrado)

## Contexto

The Games es la competencia por equipos de Días EAFIT, el mundo Titanomaquia de DÍAS OLYMPUS 2026. La jornada 1 es el jueves 2026-10-01 en la tarde y la jornada 2 el viernes 2026-10-02 de 07:00 a 20:00. En la mañana del jueves, los mismos equipos compiten por puntos en una competencia de talentos (D-034 de `dias`).

La Dirección de The Games armó un prototipo en Lovable sobre Supabase: base, autenticación y RLS propias, con la lógica en el navegador. No cumple ADR-085: la casa es el único desplegable que toca la base, un frontend consume la API y un asistente externo no es usuario. Tampoco cumple el acceso por roster (ADR-010, ADR-051), los formularios con consentimiento (ADR-013, ADR-047) ni el libro de puntos (ADR-007). Además expone el teléfono y el ID EPIK de quienes se inscriben. De ese prototipo se conservan el dominio y la experiencia, no el código.

Datos que la OE confirmó a Mateo el 2026-09-23:

- 30 equipos y 15 bases por jornada. En cada rotación se ocupan las 15 bases con un enfrentamiento cada una, y cada equipo pasa una vez por cada base de la jornada: son 15 rotaciones por jornada.
- Ganar da 1000 puntos, empatar 500 y perder 0. Las bases de inflables son macro y dan 2000, 1000 y 0.
- No hay desempate: cada enfrentamiento se gana, se empata o se pierde.
- La competencia de talentos del jueves en la mañana (The Challenge) se califica con una rúbrica, que la OE entregó el 2026-09-24.

## Decisión

1. **Módulo `competition`.** No se llama `games` para no confundirlo con la biblioteca de juegos de `participation`. Todas las tablas llevan el prefijo `competition_`. Depende de `events`, `forms` y `people`, y ningún módulo depende de él. **No toca `point_entry`**: los puntos de The Games no son GH Points, ni se acreditan a una persona.
2. **Una competencia por edición.** `competition` pertenece a una `event_edition` y pasa por `DRAFT`, `LIVE`, `FINISHED` y `ARCHIVED`. `isRehearsal` marca una competencia de ensayo, que se opera igual y se archiva después. Las fechas de las jornadas son nulas hasta que la OE las confirme, y nada las inventa.
3. **Equipos sin datos personales.** `competition_team` guarda número (1 a 99, único), nombre (único sin distinguir mayúsculas), color, estado (`ACTIVE` o `WITHDRAWN`) y la respuesta de inscripción de la que salió. El capitán no es usuario (ADR-085 regla 8): sus datos se quedan en la respuesta del formulario. Cada equipo recibe un **código de 8 caracteres** (Crockford base32), que se muestra en claro una sola vez para imprimirlo y del que la casa guarda solo un hash con secreto. Un operador lo pide para actuar en nombre del equipo (ADR-091); cinco fallos seguidos lo bloquean 15 minutos.
4. **Inscripción por formulario.** Los capitanes se inscriben en un formulario público de la casa (`/f/<slug>`, ADR-013), con consentimiento y sin crear personas (`createPerson=false`, sin embudo ni edición). El operador crea el equipo a partir de la respuesta, y un operador que no es ADMIN solo ve el nombre del equipo. Cuánto se guardan esas respuestas lo fija la política de datos (ADR-047); mientras la OE no lo defina, figura en `11-contenido-pendiente`.
5. **Bases.** `competition_base` pertenece a una jornada (1 o 2) y es `NORMAL` o `MACRO`. Las de inflables se marcan `MACRO`.
6. **Puntos en el servidor y en un libro.**
   - El navegador manda solo el desenlace (`A_WIN`, `B_WIN`, `DRAW`); el servidor calcula los puntos según el tipo de base.
   - Cada punto es una fila append-only de `competition_point_entry`: `MATCH`, `EXTRA`, `ADJUSTMENT` o `REVERSAL`.
   - Un resultado vigente por enfrentamiento. Repetir el mismo desenlace no cambia nada. Corregirlo reemplaza el resultado y revierte sus dos filas en la misma transacción, igual que ADR-007.
   - Las posiciones (general, jornada 1 y jornada 2) se suman desde el libro y nunca se guardan.
   - Sin desempate: quien empata en el total comparte el puesto (1, 2, 2, 4) y el orden visual sigue el número del equipo.
7. **Competencias extra.** `competition_extra` suma puntos a un equipo en una jornada, de dos maneras:
   - **Puntos directos:** el operador fija el total del equipo. Fijar un total inserta solo la diferencia con lo que ya hay, así que repetir la orden no suma dos veces.
   - **Rúbrica:** `competition_extra_criterion` guarda cada criterio con su peso y `competition_extra_score`, la nota consolidada de cada equipo, del 1 al 10. El total ponderado se lleva siempre a 100, aunque los pesos no sumen 100, y los puntos son el total por la escala de la extra (`rubricScale`), redondeado. Hacen falta todas las notas del equipo; volver a guardarlas deja los puntos en el nuevo total con la misma regla de la diferencia.
   - **The Challenge:** la competencia de talentos usa la rúbrica que entregó la OE el 2026-09-24. Son cinco criterios: Impacto y originalidad (20 %), Integración del equipo (20 %), Estructura y coherencia (20 %), Producción y ambientación (15 %) y Cumplimiento de normas (10 %). La escala es 10, así que un equipo suma hasta 1000 puntos en la jornada 1, igual que ganar una base normal. Las notas las carga el operador, una por criterio y equipo, como en la hoja Consolidado. El nivel (Excelente desde 85, Bueno desde 65, Regular desde 45 y Por mejorar por debajo) es informativo.
   - **La hoja de la OE no es la fuente de verdad.** Trae pesos que no suman 100 (85 %) y otros distintos en su hoja Consolidado, y fórmulas con `#REF!`. Mateo decidió el 2026-09-24 los pesos de la hoja Instrucciones, llevados a 100, y el total × 10.
8. **Calendario determinista.** El generador es una función pura con pruebas.
   - **Jornada 1:** A_i es el equipo i+1 y B_k el equipo 30−k, con i, k ∈ Z15. En la rotación r, A_i juega contra B_(i+r mod 15) en la base (2i+r) mod 15. La primera rotación queda 1–30, 2–29, …, 15–16.
   - **Jornada 2:** todos contra todos dentro de cada mitad, construidos con el starter `{1,2},{3,5},{4,10},{6,14},{7,11},{8,13},{9,12}` y dos adders complementarios, `[3,10,7,12,6,2,5]` y `[8,14,9,1,4,11,13]`. En cada rotación, los dos equipos que quedan libres (uno de cada mitad) se enfrentan entre sí.
   - **Garantías:** en cada rotación juegan los 30 y se ocupan las 15 bases, y en cada jornada cada equipo pasa una vez por cada base. Entre las dos jornadas se juegan los 435 cruces posibles, y cada equipo tiene **exactamente una** revancha, que es inevitable: 30 partidos superan los 29 rivales posibles.
   - **Cambios a mano:** el operador puede cambiar un enfrentamiento. El validador bloquea los errores (un equipo contra sí mismo, un equipo o una base repetidos en la rotación, un equipo retirado) y pide confirmar las advertencias (un cruce repetido, una base repetida en la jornada).
9. **Rotaciones.**
   - Una sola rotación `ACTIVE` por competencia, garantizada con un índice único.
   - El reloj guarda `startsAt` y `endsAt` en UTC (ADR-020). La duración la fija el operador al generar y se puede ajustar en vivo.
   - Cerrar o avanzar una rotación **nunca** completa los enfrentamientos sin resultado: quedan pendientes a la vista, y los registra el operador.
10. **Acceso.** Operar The Games no es un permiso técnico nuevo. Sale de los datos:
    - **Operador:** ADMIN; o la titular o codirección del cargo `MACROEVENT_DIRECTOR` con `roleCode='THE_GAMES'` **de la edición de la competencia**; o alguien a quien ADMIN o esa Dirección asignaron como `OPERATOR` en `competition_staff`. En todos los casos, con membresía que pueda operar (`ACTIVE` u `HONORARY`).
    - **Juez:** una fila `JUDGE` en `competition_staff`, ligada a una base. Registra resultados solo en su base y en la rotación activa de esa jornada; lo demás lo corrige un operador. Los jueces los asigna un operador.
    - **Alcance:** cada comando recibe `{competitionId}` y el dominio relee, dentro de la transacción, el cargo, la asignación y la membresía. Si el objeto no pertenece a la competencia, se responde como inexistente (ADR-072).
    - **Entrada a `/admin`:** el área de administración admite a quien tenga un rol en una competencia. El juez aterriza en su pantalla.
11. **Anuncios.** `competition_announcement` guarda un mensaje de hasta 280 caracteres, con nivel `INFO`, `WARNING` o `URGENT` y una marca de activo. Lo publica la vitrina (ADR-090).
12. **Auditoría sin eventos.** Cada escritura pasa por `runCommand`, con auditoría e IP (ADR-012, ADR-082). La primera versión no emite eventos de dominio: nadie los consumiría, y el poller descarta un evento sin handler. Quedan para después `competition.result-recorded` (push) y `competition.market-resolved`.

## Consecuencias

- Una migración aditiva (`0040`) crea las 16 tablas de la competencia, de su rúbrica y de las apuestas (ADR-091). Solo se agregan tablas, así que puede aplicarse antes del evento sin riesgo para lo que ya existe.
- Mis datos incluye las asignaciones propias de personal. Las pruebas de integración vacían las tablas nuevas.
- Para que la Dirección opere, primero hay que crear la edición de Días 2026 y registrar el cargo en la mesa (ADR-064). Mientras no exista, solo ADMIN opera.
- Queda fuera de alcance: la inscripción de los integrantes de cada equipo, un check-in por equipo, las notificaciones push de resultados y los premios.

## Verificación requerida

**Unitarias:**
- Puntuación.
- Calendario: rotación 1 sembrada, todas las restricciones con 1 a 15 rotaciones, una revancha por equipo con 15, determinismo.
- Posiciones con empates.
- La rúbrica: pesos, total llevado a 100, puntos × 10, niveles y notas fuera de rango.
- Códigos.

**Integración:**
- Matriz de acceso: ADMIN; Dirección de esta edición sí, de otra no; en licencia no; juez solo en su base.
- Ids ajenos.
- Una sola rotación activa bajo concurrencia.
- Resultado repetido y corrección con reversiones.
- Extras idempotentes, también con la rúbrica.

**E2E:** operador y juez en celular, con axe.

## Enmienda (2026-09-24, ADR-093)

Regla 8: un equipo que repite base en la jornada deja de ser advertencia y pasa a ser **error** del validador, porque cada equipo tiene que jugar todas las bases. Un cambio a mano que lo provoque no se guarda, ni siquiera confirmando las advertencias. Quedan como advertencias el cruce repetido y el equipo que no juega en una rotación. Ver [ADR-093](ADR-093-cada-equipo-juega-todas-las-bases.md).

## Enmienda (2026-09-24, ADR-094)

Regla 8: además de generarse, el calendario de una jornada sin rotaciones se puede **importar** pegando la hoja de la OE, con las columnas Equipo, Rotación, Base y Rival. La hoja tiene que ser coherente y pasa por el mismo validador, y la jornada entra completa o no entra. Regla 3: si la competencia no tiene equipos, la importación crea los de la hoja, numerados en su orden. Si ya tiene, los nombres tienen que coincidir. Las bases que falten se crean como «Base N», normales. Ver [ADR-094](ADR-094-calendario-de-the-games-desde-la-hoja-de-la-oe.md).
