# ADR-096: Hub de capitanes en DÍAS con la API de la casa

- Estado: Aceptada (enmendada por ADR-097 y ADR-098)
- Fecha: 2026-09-28
- Relacionadas: ADR-011, ADR-012, ADR-014, ADR-072, ADR-082, ADR-085, ADR-089, ADR-090, ADR-091, ADR-095
- Enmienda:
  - ADR-089, regla 3: el código del equipo también abre el hub de apuestas.
  - ADR-091, regla 3: el capitán registra la apuesta de su equipo en el hub, y el operador sigue pudiendo hacerlo.
  - ADR-090, regla 7: la primera escritura de la API v1, autorizada por el código del equipo y con CORS con credenciales solo para el origen de DÍAS.

## Contexto

Hoy el capitán no entra a nada. Le dicta el código del equipo a un operador, y el operador registra la apuesta (ADR-091, regla 3). Con 30 equipos y apuestas abiertas durante la jornada, la mesa de apuestas se vuelve el cuello de botella.

El 2026-09-28 Mateo decidió tres cosas:

- Cada capitán tiene acceso solo a las apuestas de su equipo.
- Entra con el código de 8 caracteres de la tarjeta, que ya existe y comparten los dos capitanes de cada equipo.
- El hub vive en `dias.oeeafit.com/capitanes`, junto a la tabla, con el diseño de Titanomaquia.

`dias` es estático (D-001 de `dias`), así que el hub es una página de `dias` que habla con la casa. Es lo que pide ADR-085: un backend y frontends delgados que usan su API.

## Decisión

1. **La API del hub, en `/api/v1/the-games/hub`:**
   - `POST /sesion` recibe `{ code }`. Si el código es de un equipo de una competencia en vivo con apuestas activas, abre la sesión y devuelve el estado del hub. El capitán no elige su equipo: así nadie puede bloquear el código de otro a punta de intentos.
   - `GET /` devuelve el estado del hub del equipo de la sesión:
     - el saldo;
     - las apuestas abiertas, con sus opciones por número de equipo y la bolsa de cada una;
     - si el equipo ya apostó en cada una;
     - las apuestas del equipo con su resultado.

     Sin sesión responde 401.
   - `POST /apuestas` recibe `{ marketId, pick, stake }`, donde `pick` es el número del equipo elegido. Registra la apuesta y devuelve el estado nuevo.
   - `DELETE /sesion` cierra la sesión.
   - Las respuestas son JSON versionado (`version: 1`), validado con Zod antes de salir, y llevan `Cache-Control: no-store`. No incluyen ids de equipo, nombres de personas, correos ni celulares.
2. **Sesión del equipo, no de una persona.**
   - Es una cookie de la casa firmada con su secreto, con la competencia, el equipo y el momento en que se emitió el código.
   - La cookie es `httpOnly`, `SameSite=Lax`, segura con HTTPS y con ruta `/api/v1/the-games/hub`, y dura 12 horas.
   - `dias.oeeafit.com` y `oeeafit.com` son el mismo sitio, así que el navegador la manda en los pedidos de `dias` con `credentials: "include"`. `dias` nunca la lee ni la guarda.
   - La sesión deja de valer si se vuelven a emitir los códigos, si el equipo se retira o si la competencia deja de estar en vivo.
3. **CORS con credenciales solo para DÍAS.**
   - Las rutas del hub devuelven el origen exacto de `PUBLIC_API_ORIGINS`, con `Access-Control-Allow-Credentials: true` y `Vary: Origin`.
   - Un `POST` o `DELETE` desde otro origen responde 403.
   - Las escrituras piden `Content-Type: application/json`, lo que obliga a la verificación previa (preflight) de CORS.
   - La vitrina (regla 4 de ADR-090) no cambia: sigue sin credenciales.
4. **Tope de fallos.**
   - Un código que no corresponde deja una fila de auditoría con la IP.
   - Treinta fallos desde la misma IP en 15 minutos cierran la entrada por 15 minutos. El tope es alto porque el campus sale por NAT (ADR-090, regla 5), y con 32⁸ códigos posibles adivinar uno no es viable.
   - Los fallos se cuentan en memoria, porque la casa corre en un solo proceso.
   - El hub respeta el bloqueo del código por fallos ante el operador (ADR-089, regla 3).
5. **Las mismas reglas de la apuesta.**
   - El hub y el operador usan el mismo núcleo: una apuesta por equipo en cada apuesta, sin pasar del saldo, solo mientras está abierta, y por el propio equipo solo si `allowSelfBet` lo permite (ADR-091).
   - La apuesta del hub no tiene persona (`createdById` nulo).
   - El operador sigue registrando con el código, para el capitán sin celular.
6. **Auditoría:**
   - `competition.hub.enter` al entrar.
   - `competition.hub.code-failed` con un código que no corresponde.
   - `competition.bet.place` con `via: "HUB"` al apostar.
   - Todas las filas llevan la IP (ADR-082) y ninguna lleva datos personales.
7. **Tarjetas.** Las tarjetas de código imprimen «Apostá en dias.oeeafit.com/capitanes». La dirección sale del primer origen de `PUBLIC_API_ORIGINS`.

## Consecuencias

- **Sin migración.** La sesión es una cookie firmada y los fallos se cuentan en memoria y en la auditoría.
- **`dias`:**
  - Suma la página `/capitanes/` y un enlace desde la tabla.
  - Ya no es solo lectura: habla con la casa con la sesión del equipo, aunque sigue sin guardar nada (D-039 de `dias`).
- **Tarjetas.** Quien tenga la tarjeta de un equipo apuesta por él, así que se entrega en mano. Si una se pierde, «Volver a emitir todos» deja sin valor las viejas y cierra las sesiones abiertas.
- **Staging.** Con la cookie `SameSite=Lax`, el hub solo se prueba entero con la casa y DÍAS en el mismo sitio: los dos en local, o en producción.

## Verificación requerida

- **Unitarias:**
  - la firma y la lectura de la sesión;
  - el estado del hub: sin ids de equipo y con los resultados;
  - el CORS con credenciales;
  - las rutas: origen ajeno, sin sesión, verificación previa.
- **Integración:**
  - Entrar:
    - con el código, en minúsculas y con guion;
    - con un código que no corresponde;
    - pasando el tope por IP;
    - con el equipo bloqueado.
  - Volver a emitir el código invalida la sesión.
  - Apostar desde el hub:
    - descuenta el saldo;
    - acepta una sola apuesta por equipo, también frente al operador;
    - rechaza la apuesta cerrada, la que no alcanza el saldo, la del equipo por sí mismo y la de un equipo que no es opción;
    - rechaza una competencia que no está en vivo.
  - La auditoría no lleva datos personales.
- **E2E:** la API con el origen de DÍAS. Entrar con un código errado y con uno bueno, apostar, ver la apuesta y salir.

## Enmienda (2026-09-28, ADR-097)

Regla 1: el estado del hub suma `route`, el recorrido del equipo de la sesión en las dos jornadas: base, rival y resultado de cada rotación. El hub sigue en `version: 1`. Ver [ADR-097](ADR-097-recorrido-de-cada-equipo.md).

## Enmienda (2026-09-29, ADR-098)

Regla 1: el estado del hub suma `powers`: las tarjetas del equipo, cada una con su poder, su jornada y su estado. Si ya se usó, también trae la rotación, la base, el rival y el efecto. No lleva ids, y el hub sigue en `version: 1`. El capitán solo consulta: la tarjeta física es la declaración. Ver [ADR-098](ADR-098-poderes-de-the-games.md).
