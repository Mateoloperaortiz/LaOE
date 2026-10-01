# ADR-104: Los puntos de apuestas suman a la tabla general de The Games

- Estado: Aceptada
- Fecha: 2026-10-01
- Relacionadas: ADR-089, ADR-090, ADR-091, ADR-096, ADR-099
- Enmienda: ADR-091, regla 1, y ADR-089, que decía que el ganador sale solo de los enfrentamientos y de las competencias extra. También sube la versión de las instrucciones del hub (ADR-099).

## Contexto

ADR-091 dejó los puntos de apuestas en un libro propio que no se suma a la tabla de The Games, porque así lo había confirmado la OE el 2026-09-23. El 2026-10-01, jueves del evento, Mateo pidió lo contrario: los puntos de apuestas **sí** se suman a la tabla general, y lo que suma es el saldo de apuestas de cada equipo, con los 1000 iniciales incluidos.

## Decisión

1. **La tabla general suma el saldo de apuestas.** El total de cada equipo en la general es la suma de su libro de puntos más su saldo en `competition_credit_entry`. Las tablas del jueves y del viernes no cambian: el saldo no es de una jornada.
2. **El libro de apuestas sigue aparte.** No se copian filas al libro de puntos: la tabla se calcula en cada lectura, como siempre (ADR-089, regla 6). El saldo se sigue moviendo solo con las reglas de ADR-091.
3. **Solo con las apuestas prendidas.** Si `bettingEnabled` está apagado, la general no suma el saldo. Así el interruptor de ADR-091, regla 6, sigue apagando toda la mecánica.
4. **Saldo actual.** La general usa el saldo del momento. Cuando un equipo apuesta, su `STAKE` le baja el total hasta que la apuesta se resuelve o se cancela; al final del evento es el saldo final.
5. **Instrucciones del hub, versión 2.** El texto de las apuestas cambia en DÍAS (D-044) y `HUB_TERMS_VERSION` pasa a 2, así que cada equipo vuelve a aceptar en su siguiente ingreso.

## Consecuencias

- Sin migración.
- La vitrina (ADR-090) no cambia de forma: `standings.overall` ya trae el total con el saldo, y la tabla de saldos sigue igual.
- Mientras todos tengan los 1000 iniciales, el orden de la general no cambia: todos suben 1000.
- Si un equipo no tiene `GRANT`, no suma nada hasta que se le otorgue.

## Verificación requerida

- **Unitarias:** la general suma el saldo; las tablas de cada jornada no.
- **Integración:** con las apuestas prendidas, la general suma el saldo y baja con la apuesta; con las apuestas apagadas, no suma.
