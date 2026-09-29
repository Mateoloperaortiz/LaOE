# ADR-099: Instrucciones del hub de capitanes

- Estado: Aceptada
- Fecha: 2026-09-29
- Relacionadas: ADR-012, ADR-082, ADR-091, ADR-096, ADR-098
- Enmienda: ADR-096, regla 1: el primer ingreso de cada equipo pide aceptar las instrucciones vigentes del hub.

## Contexto

Mateo pidió que los capitanes no puedan usar el hub hasta leer y aceptar unas instrucciones. Deben explicar qué es el hub, cómo se apuesta, cómo se usan los poderes, cómo cuidar el código y a quién acudir.

Mateo decidió tres cosas:

- la casa deja constancia de la aceptación;
- se acepta una vez por equipo;
- la casa redacta el texto con las reglas ya confirmadas (ADR-091 y ADR-098).

## Decisión

1. **Versión de las instrucciones.** `HUB_TERMS_VERSION` vive en `hub-pure.ts` y empieza en 1. El texto vive en DÍAS (D-042), que es quien lo muestra; la casa solo conoce la versión. Cambiar el texto sube la versión en los dos repos, y cada equipo vuelve a aceptar.
2. **Constancia por equipo.** `competition_team.hubTermsVersion` y `hubTermsAcceptedAt` guardan la última versión que aceptó el equipo y cuándo. Cada aceptación queda además en la auditoría (`competition.hub.terms`), con la IP. No se guarda ningún dato de la persona: el capitán acepta en nombre del equipo, con el código.
3. **Entrar.** `POST /sesion` recibe `{ code, accept? }`. Con un código válido:
   - si el equipo ya aceptó la versión vigente, se abre la sesión como antes;
   - si no la ha aceptado y `accept` trae la versión vigente, se guarda la aceptación y se abre la sesión;
   - si no la ha aceptado y `accept` no viene, la respuesta es 409 `{ error, terms: versión }`. No se abre sesión ni cuenta como fallo. DÍAS muestra las instrucciones y vuelve a enviar el código con `accept`.
4. **Sesión.** La sesión de un equipo que no aceptó la versión vigente no vale: `getHubTeam` y la apuesta del hub lo comprueban. Si la versión sube, el hub vuelve a pedir el código y las instrucciones.
5. **Operación.** La pestaña Equipos muestra si cada equipo aceptó y cuándo.

## Consecuencias

- **Migración `0043`, aditiva:** dos columnas nullable en `competition_team`.
- **Orden de publicación:** DÍAS primero (D-042). La casa nueva responde 409 al primer ingreso, y un DÍAS anterior no sabría mostrar las instrucciones.
- **Códigos:** volver a emitirlos no borra la aceptación, porque la aceptación es del equipo y no del código.

## Verificación requerida

- **Integración:**
  - el primer ingreso sin aceptar responde con la versión, sin sesión y sin contar un fallo;
  - con `accept`, se abre la sesión y quedan las columnas y la auditoría;
  - un segundo ingreso sin `accept` entra;
  - con una versión anterior, la sesión no vale y la apuesta se rechaza.
- **Unitarias de la ruta:** 409 con `terms`, y `accept` en el cuerpo.
- **E2E de la API:** entrar aceptando las instrucciones.
