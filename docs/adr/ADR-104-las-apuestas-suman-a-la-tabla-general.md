# ADR-104: Los puntos de apuestas suman a la tabla general de The Games

- Estado: Aceptada
- Fecha: 2026-10-01
- Relacionadas: ADR-089, ADR-090, ADR-091, ADR-096, ADR-099
- Enmienda: ADR-091, regla 1, y ADR-089, que decía que el ganador sale solo de los enfrentamientos y de las competencias extra. También sube la versión de las instrucciones del hub (ADR-099).

## Contexto

ADR-091 dejó los puntos de apuestas en un libro propio que no se suma a la tabla de The Games, porque así lo había confirmado la OE el 2026-09-23. El 2026-10-01, jueves del evento, Mateo pidió lo contrario: los puntos de apuestas **sí** se suman a la tabla general, y lo que suma es el saldo de apuestas de cada equipo, con los 1000 iniciales incluidos.

Ese día, antes de la primera rotación, ya había seis apuestas sobre The Challenge, todas resueltas, y los saldos iban de 8 a 4045. Esas apuestas cuentan igual que las que vengan.

## Decisión

1. **La tabla general suma los puntos de apuestas.** El total de cada equipo en la general es la suma de su libro de puntos más su saldo en `competition_credit_entry`, con la salvedad de la regla 4. Las tablas del jueves y del viernes no cambian, porque el saldo no es de una jornada.
2. **El libro de apuestas sigue aparte.** No se copian filas al libro de puntos: la tabla se calcula en cada lectura, como siempre (ADR-089, regla 6). El saldo se sigue moviendo solo con las reglas de ADR-091.
3. **Solo con las apuestas prendidas.** Si `bettingEnabled` está apagado, la general no suma nada de apuestas. Así el interruptor de ADR-091, regla 6, sigue apagando toda la mecánica.
4. **Lo apostado sigue contando hasta que la apuesta se resuelve.**
   - En la general no se descuenta el `STAKE` de una apuesta abierta o cerrada sin resolver. Apostar no baja la tabla, y una apuesta que quede sin resolver no le quita puntos a nadie.
   - Al resolver, la general queda en el saldo: con el pago si se acertó, o sin lo apostado si no. Al cancelar, queda en el saldo con la devolución.
   - Con todas las apuestas resueltas, la general suma el saldo final.
   - Se calcula en una sola consulta, para que una apuesta que entra durante la lectura no se cuente a medias.
5. **Instrucciones del hub, versión 2.** El texto de las apuestas cambia en DÍAS (D-044) y `HUB_TERMS_VERSION` pasa a 2, así que cada equipo vuelve a aceptar en su siguiente ingreso. Mientras la casa siga en la versión 1, DÍAS acepta la versión que pida la casa, así que publicar DÍAS primero no deja a nadie fuera del hub.

## Consecuencias

- Sin migración y sin escrituras: las apuestas y los saldos quedan como están.
- La vitrina (ADR-090) no cambia de forma: `standings.overall` ya trae el total con las apuestas.
- La tabla de saldos (ADR-091, regla 5) sigue mostrando el saldo disponible para apostar, que sí descuenta lo apostado.
- Mientras todos tengan los 1000 iniciales, esos puntos no cambian el orden de la general: todos suben 1000.
- Si un equipo no tiene `GRANT`, no suma los 1000 hasta que se le otorguen.
- Al publicar la casa, las sesiones abiertas del hub dejan de valer hasta que el equipo acepte la versión 2. Una apuesta que se intente en ese momento no se registra y se vuelve a hacer.

## Verificación requerida

- **Unitarias:** la general suma los puntos de apuestas y las tablas de cada jornada no.
- **Integración:**
  - lo apostado sigue contando con la apuesta abierta y con la apuesta cerrada sin resolver;
  - al resolver, la general queda en el saldo;
  - con las apuestas apagadas, no suma.
