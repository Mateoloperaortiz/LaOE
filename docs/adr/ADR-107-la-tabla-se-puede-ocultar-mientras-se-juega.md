# ADR-107: La tabla de posiciones se puede ocultar mientras se juega

- Estado: Aceptada
- Fecha: 2026-10-02
- Relacionadas: ADR-089, ADR-090, ADR-095, ADR-097
- Enmienda:
  - ADR-090, regla 1: la vitrina lleva `standingsHidden` y `teams`, y con la tabla oculta las tres tablas van vacías.

## Contexto

La vitrina pública de The Games (ADR-090) publica la tabla general y la de cada jornada en cuanto hay resultados, y `dias` la muestra en `/the-games/` y en el podio de la pantalla grande (D-045 de `dias`). El viernes 2 de octubre, en plena segunda jornada, Mateo pidió un mecanismo para esconder la tabla y el podio, para que los equipos compitan sin estar pendientes de las posiciones.

`dias` es estático y no guarda estado (D-001 de `dias`), así que el interruptor tiene que vivir aquí, como `showCaptains` (ADR-095). A diferencia de los capitanes, la tabla no tiene datos personales: puede operarla la Dirección de The Games, no solo el ADMIN.

## Decisión

1. **Un interruptor por competencia.** `competition.showStandings` arranca prendido. La operación de la competencia (ADMIN, la Dirección de The Games y el personal OPERATOR) lo apaga y lo prende desde el panel, en Posiciones, con «Ocultar la tabla» y «Mostrar la tabla». Es un interruptor, no una programación: nada lo cambia solo.
2. **Con la tabla oculta, la vitrina no manda posiciones.** `standings.overall`, `day1` y `day2` van vacías y `standingsHidden` es `true`. Las posiciones no salen de la casa, tampoco para quien consulte la API a mano.
3. **La vitrina siempre lleva `teams`:** número, nombre y color de cada equipo, por número. Así `dias` puede nombrar a los equipos en «Buscá tu equipo» aunque la tabla esté oculta. Los dos campos son aditivos: la vitrina sigue en `version: 1`.
4. **Lo demás no cambia.** La rotación en curso y sus resultados por base, el recorrido de cada equipo (ADR-097), las apuestas y sus saldos, los anuncios y el hub de capitanes siguen igual. Ocultar la tabla no esconde lo que cada equipo hizo, solo el orden entre todos.
5. **El podio se oculta con la tabla.** Para proyectarlo, la Dirección muestra la tabla justo antes y, si quiere, la vuelve a ocultar después de proyectar. Mientras está a la vista, también se ve en `dias.oeeafit.com/the-games/`.
6. **Auditoría.** Cada cambio deja `competition.standings.visibility`, con el valor anterior y el nuevo.

## Consecuencias

- **Migración `0046`, aditiva:** la columna `competition.show_standings`, prendida.
- **`dias`** muestra un aviso en el lugar de la tabla y en el podio (D-047 de `dias`), y usa `teams` para el selector de equipos. Se publica antes que la casa: los dos campos son opcionales allá.
- **El panel** no cambia para los jueces: Posiciones ya era de la operación.
- **Riesgo aceptado:** con el recorrido público de cada equipo (ADR-097), alguien podría reconstruir la tabla pidiendo los 30 recorridos. El objetivo es que los equipos no estén pendientes de las posiciones, no un secreto.

## Verificación requerida

- **Unitarias:** la vitrina con la tabla prendida y apagada: `standingsHidden`, tablas vacías, `teams` sin ids y en orden.
- **Integración:** la Dirección apaga y prende la tabla; la vitrina responde en consecuencia; la auditoría guarda los dos cambios.
