# ADR-178: Las ligas semanales

- Estado: Propuesta
- Fecha: 2026-11-13
- Relacionadas: ADR-067, ADR-075, ADR-160 (regla 5, momentos de marca), ADR-175

## Contexto

El plan maestro (§7, ola 3) pide **ligas** al estilo de Duolingo, con el momento de marca del ascenso (§4.4). Los rankings de GH Points ya existen, pero son del semestre entero: a mitad de semestre quien va atrás ya no tiene cómo alcanzar. Una liga semanal vuelve a empezar cada lunes y compara a cada persona con gente de su nivel.

## Decisión

1. **Cuatro ligas**: Bronce, Plata, Oro y Diamante. Entra quien tiene la actividad prendida (ADR-175) y puede participar; quien llega por primera vez empieza en Bronce.
2. **La semana** va de lunes a domingo en la hora de la OE. En cada liga se ordena por los GH Points ganados esa semana, con el mismo libro de puntos de siempre: la liga no da ni quita puntos.
3. **Subir y bajar.** Al cerrar la semana, los primeros cinco de cada liga suben una y los últimos cinco bajan una, siempre que hayan sumado algo; quien no sumó nada en la semana se queda donde estaba. Lo hace un trabajo del lunes temprano, que es idempotente: correrlo dos veces deja lo mismo.
4. **El momento del ascenso.** La semana en que la persona sube, su liga lo celebra con «¡Subiste a Plata!» y el sello «¡OE OE OE!»; la vibración de los momentos de marca (ADR-160 regla 5) suena una sola vez.
5. **Dónde se ve.** En Juegos, «Tu liga» muestra la tabla de la semana de su liga con los nombres de quienes tienen la actividad prendida, y cuánto falta para subir.

## Consecuencias

- **Migración aditiva.** Una tabla nueva, `league_standing`, en `participation`: la liga de cada persona en cada semana. Una persona entra a la tabla de su semana cuando abre su liga; el cierre del lunes pone la liga de la semana nueva a quienes ya estaban.
- **Trabajos.** Un trabajo programado nuevo, `participation.league-close`, los lunes.
- **Pruebas.** Unitarias de subir, bajar y quedarse. Integración del cierre idempotente y de que una persona con la actividad apagada no entra. E2E de la tabla de la semana y del momento del ascenso.
