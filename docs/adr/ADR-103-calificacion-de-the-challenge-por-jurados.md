# ADR-103: Calificación de The Challenge por jurados

- Estado: Aceptada
- Fecha: 2026-10-01
- Relacionadas: ADR-089, ADR-100
- Enmienda: ADR-100, regla 1. La casa ordena a los equipos con las notas de los jurados; el podio y sus puntos los sigue poniendo la Dirección.

## Contexto

The Challenge se juega el jueves 2026-10-01 en la mañana. Mateo quiere calificarlo en la casa con la rúbrica de la OE, y que cada jurado califique por aparte.

La rúbrica es la de siempre, `THE_CHALLENGE_RUBRIC`:
- 5 criterios del 1 al 10, con pesos de 20, 20, 20, 15 y 10.
- Los pesos suman 85, y la casa lleva el total a 100 (ADR-089, regla 7).

La hoja «Consolidado» de la OE tiene fórmulas rotas (`#REF!`).

La extra con rúbrica que ya existe no sirve para esto, por dos razones:
- Guarda una sola nota por equipo y criterio.
- Le da a cada equipo su total × 10 en el libro.

ADR-100 cambió esa regla: The Challenge da 2000, 1000 y 500 solo al podio, en una extra de puntos directos, y los empates los resuelve la organización.

## Decisión

1. **Notas de los jurados.**
   - Se guardan junto a una extra de puntos directos, en `competition_extra_jury_score`: el jurado (su nombre), el equipo y las 5 notas, del 1 al 10 y en el orden de la rúbrica.
   - Un jurado tiene una sola fila por equipo.
   - Las notas **no tocan el libro**.

2. **Carga.**
   - Cualquier operador pega la tabla de un jurado. Sirve la plantilla de jurado o la hoja «Consolidado» de la OE tal cual.
   - El equipo sale de la primera celda, por número o por nombre. Las notas son las primeras 5 celdas numéricas que siguen.
   - El total, el nivel, los `#REF!` y las filas sin notas se ignoran.
   - Es todo o nada, y cada error dice su línea.
   - Volver a cargar un jurado reemplaza solo sus notas. Un jurado mal cargado se quita.

3. **Orden.** Por equipo:
   - cada criterio es el promedio de los jurados que lo calificaron;
   - el total es el ponderado llevado a 100;
   - el nivel es informativo.

   Los equipos van de mayor a menor total. Los empates comparten puesto y se marcan. Los equipos sin notas van al final.

4. **Podio.**
   - La pantalla marca los tres primeros como podio sugerido y avisa si un empate toca el podio.
   - Los puntos los pone la Dirección, en los mismos campos de puntos de la extra: 2000, 1000 y 500 (ADR-100). La casa no los asigna sola.

5. **Auditoría.** `competition.extra.jury` y `competition.extra.jury-remove` guardan el jurado y el conteo de equipos.

## Consecuencias

- **Migración `0045`, aditiva:** una tabla.
- **La extra con rúbrica de siempre no cambia.** No se usa en `the-games-2026` (ADR-100).
- **Respaldo:** si la casa no está disponible, la plantilla de jurado calcula el total de cada equipo, y el podio se pone a mano.

## Verificación requerida

- **Unitarias:**
  - el lector con la hoja «Consolidado» de la OE y con columnas sueltas;
  - errores;
  - promedios;
  - total llevado a 100;
  - empates;
  - equipos sin notas.
- **Integración:**
  - dos jurados promediados;
  - reemplazar o quitar un jurado;
  - permisos;
  - solo extras de puntos directos;
  - el libro no cambia.
