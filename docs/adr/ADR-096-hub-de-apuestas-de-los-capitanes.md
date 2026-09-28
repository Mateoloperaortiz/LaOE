# ADR-096: Hub de apuestas de los capitanes con el código del equipo

- Estado: Aceptada
- Fecha: 2026-09-28
- Relacionadas: ADR-011, ADR-012, ADR-014, ADR-072, ADR-082, ADR-085, ADR-089, ADR-090, ADR-091, ADR-095
- Enmienda: ADR-089 (regla 3: el código del equipo también abre el hub de apuestas), ADR-091 (regla 3: el capitán registra la apuesta de su equipo en el hub y el operador sigue pudiendo hacerlo), ADR-090 (regla 7: una escritura pública fuera de `/admin`, autorizada por el código del equipo, sin cuenta ni sesión de persona)

## Contexto

Hoy el capitán no entra a nada. Le dicta el código del equipo a un operador, y el operador registra la apuesta (ADR-091, regla 3). Con 30 equipos, apuestas abiertas durante la jornada y un solo operador por mesa, la fila en la mesa de apuestas se vuelve el cuello de botella.

El 2026-09-28 Mateo decidió que cada capitán tenga acceso solo a las apuestas de su equipo, en un hub propio. Se entra con el código de 8 caracteres de la tarjeta, que ya existe; los dos capitanes de un mismo equipo usan el mismo código. Los 1000 puntos iniciales ya se repartieron en `the-games-2026`.

## Decisión

1. **`oeeafit.com/capitanes`.** Es una página pública de la casa, fuera de `/admin`, y no usa la sesión de ninguna persona. `dias` la enlaza desde su tabla (D-039 de `dias`) pero no la aloja, porque es estático (D-001 de `dias`).
2. **Se entra solo con el código del equipo.**
   - El capitán no elige su equipo. La casa lo busca entre los de las competencias en vivo con apuestas activas. Así nadie puede bloquear el código de otro equipo a punta de intentos.
   - Un código que no corresponde deja una fila de auditoría con la IP. Treinta fallos desde la misma IP en 15 minutos la dejan sin entrar hasta que pase ese tiempo. El tope es alto porque el campus sale por NAT (ADR-090, regla 5). Con 32⁸ códigos posibles, adivinar uno no es viable.
   - Si el código del equipo quedó bloqueado por fallos ante el operador (ADR-089, regla 3), el hub respeta el bloqueo.
3. **Sesión del equipo, no de una persona.**
   - Una cookie firmada con el secreto de la casa guarda la competencia, el equipo y el momento en que se emitió el código. Es `httpOnly`, `SameSite=Lax`, segura con HTTPS, con ruta `/capitanes`, y dura 12 horas.
   - Volver a emitir los códigos invalida las sesiones abiertas, y lo mismo pasa si el equipo se retira o la competencia deja de estar en vivo.
   - No hay tabla de sesiones ni cuenta.
4. **Solo apuestas.**
   - En el hub el equipo ve su saldo y las apuestas abiertas con sus bolsas, apuesta y ve cómo quedaron las suyas. No ve la administración, las apuestas de otros equipos ni datos personales.
   - Las reglas son las de ADR-091: una apuesta por equipo en cada apuesta, sin pasar del saldo, solo mientras la apuesta está abierta, y apostar por el propio equipo según `allowSelfBet`.
   - El núcleo es el mismo que usa el operador, así que las dos vías no se pueden desfasar.
5. **El operador sigue.** Registrar la apuesta con el código desde la pestaña Apuestas no cambia. Sirve para el capitán que no tiene celular.
6. **Auditoría:**
   - Entrar deja `competition.hub.enter` en el equipo.
   - Un código que no corresponde deja `competition.hub.code-failed`.
   - La apuesta deja `competition.bet.place` con `via: "HUB"`, y no tiene persona (`createdById` nulo).
   - Todas las filas llevan la IP (ADR-082) y ninguna lleva datos personales.

## Consecuencias

- **Sin migración.** La sesión es una cookie firmada y los fallos se cuentan en la auditoría.
- **Tarjetas.** Se imprimen como hoy y suman la dirección `oeeafit.com/capitanes`.
- **Seguridad:**
  - Quien tenga la tarjeta de un equipo apuesta por él: la tarjeta se entrega en mano, igual que hoy.
  - Si una se pierde, «Volver a emitir todos» cierra todas las sesiones y deja las tarjetas viejas sin valor.
- **La página se actualiza sola** mientras está a la vista, como la pantalla del juez.

## Verificación requerida

- **Unitarias:** la firma y la lectura de la sesión: válida, alterada, vencida o con otro secreto.
- **Integración:**
  - Entrar:
    - con el código;
    - con un código que no corresponde;
    - pasando el tope por IP;
    - con el equipo bloqueado.
  - Volver a emitir el código invalida la sesión.
  - Apostar desde el hub:
    - descuenta el saldo;
    - acepta una sola apuesta por equipo;
    - rechaza la apuesta cerrada, la que no alcanza el saldo y la del equipo por sí mismo;
    - rechaza una competencia que no está en vivo.
  - La auditoría no lleva datos personales.
- **E2E con axe:** el capitán entra desde el celular, apuesta, ve su apuesta y sale.
