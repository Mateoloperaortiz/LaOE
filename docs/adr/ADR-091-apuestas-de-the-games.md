# ADR-091: Apuestas de The Games con puntos virtuales

- Estado: Aceptada (enmendada por ADR-096 y ADR-104); implementación en curso
- Fecha: 2026-09-23
- Relacionadas: ADR-007, ADR-012, ADR-072, ADR-085, ADR-089, ADR-090

## Contexto

La Dirección de The Games quiere que los equipos apuesten entre ellos. El 2026-09-23 la OE confirmó a Mateo tres cosas:

- Cada equipo empieza con **1000 puntos de apuestas**.
- Esos puntos **no cuentan para el ganador de The Games**, que sale solo de los enfrentamientos y de las competencias extra (ADR-089). Tienen una tabla propia.
- La mecánica es la del prototipo: el operador abre una apuesta con dos o más equipos, cada equipo elige un ganador y la bolsa se reparte entre los que aciertan.

En el prototipo el saldo nunca se descontaba, porque su RLS bloqueaba la escritura. Además, una apuesta se podía pagar dos veces, y cualquier usuario autenticado podía apostar por cualquier equipo. Esta decisión va aparte de ADR-089 para poder apagarla sin tocar la competencia.

## Decisión

1. **Puntos virtuales en un libro propio.** Los puntos de apuestas no son dinero, no se canjean, no son GH Points y no se suman a la tabla de The Games. Viven en `competition_credit_entry`, un libro append-only con estos tipos:
   - `GRANT`: los puntos iniciales, uno por equipo;
   - `STAKE`: lo apostado, en negativo;
   - `PAYOUT`: el pago;
   - `REFUND`: la devolución;
   - `ADJUSTMENT` y `REVERSAL`: correcciones.

   El saldo es la suma de las filas. `startingCredits` es 1000 para 2026 y lo otorga el operador con una orden, idempotente por equipo.
2. **Apuestas del operador.** `competition_market` tiene título, dos o más equipos (`competition_market_option`), un enfrentamiento ligado opcional y un cierre opcional (`closesAt`). Pasa por `DRAFT`, `OPEN`, `CLOSED`, `RESOLVED` y `CANCELLED`. Cuando llega `closesAt`, la apuesta se considera cerrada sin necesidad de un job: el servidor lo deriva de la hora en cada lectura y en cada escritura.
3. **El capitán no tiene cuenta.** Un operador registra la apuesta del equipo con el código del equipo (ADR-089 regla 3), que prueba que el capitán está presente. En una sola transacción, `placeBetAs`:
   - bloquea la apuesta y el equipo;
   - verifica el código;
   - comprueba que la apuesta esté abierta y que el saldo alcance;
   - inserta la apuesta y su `STAKE`.

   Cada equipo apuesta una vez por apuesta, con un índice único que lo garantiza. Si un equipo puede apostar por sí mismo es una opción de la competencia, apagada mientras la OE no lo confirme.
4. **Reparto por bolsa, sin pagar dos veces.** Al resolver, cada acertante recibe lo que apostó más ⌊apuesta × bolsa perdedora / bolsa ganadora⌋. El sobrante del redondeo se reparte por mayor resto, después por orden de llegada y después por id, así que la suma de los pagos es exactamente la bolsa. Si nadie acertó, o si la apuesta se cancela, se devuelve todo. Resolver una apuesta ya resuelta no hace nada, y el índice único `(betId, kind)` lo garantiza también en la base.
5. **Qué es público.** La vitrina (ADR-090) muestra las apuestas con su estado, sus opciones, la bolsa por opción y el ganador, más la tabla de saldos por equipo. La apuesta de cada equipo solo se ve en `/admin`.
6. **Interruptor.** `competition.bettingEnabled` apaga toda la mecánica sin tocar los datos. Es la primera línea de corte si el tiempo no alcanza.

## Consecuencias

- Las tablas llegan en la misma migración de ADR-089, para no hacer dos migraciones la semana del evento.
- Un error se corrige con `ADJUSTMENT` o `REVERSAL`, con motivo y auditoría; nunca editando filas.

## Verificación requerida

- **Unitarias:** la bolsa se conserva (con un generador determinista), la devolución y el sobrante.
- **Integración:** saldo insuficiente; dos apuestas simultáneas del mismo equipo; código errado y bloqueo; apuesta cerrada por hora; resolver dos veces paga una; cancelar devuelve.

## Enmienda (2026-09-28, ADR-096)

Regla 3: el capitán puede registrar la apuesta de su equipo en el hub (`dias.oeeafit.com/capitanes`, con la API de la casa), entrando con el código de la tarjeta. Las reglas y el núcleo de la apuesta son los mismos, y el operador sigue pudiendo registrarla con el código. La apuesta del hub no tiene persona y su auditoría lleva `via: "HUB"`. Ver [ADR-096](ADR-096-hub-de-apuestas-de-los-capitanes.md).

## Enmienda (2026-10-01, ADR-104)

Regla 1: los puntos de apuestas siguen en su libro propio, pero la tabla general de The Games suma el saldo de cada equipo mientras `bettingEnabled` esté prendido, sin descontar lo apostado en apuestas que siguen sin resolver. Las tablas de cada jornada no lo suman. Ver [ADR-104](ADR-104-las-apuestas-suman-a-la-tabla-general.md).
