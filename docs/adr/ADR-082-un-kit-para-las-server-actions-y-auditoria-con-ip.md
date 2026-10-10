# ADR-082: Un kit para las server actions, y la auditoría siempre con IP

- Estado: Aceptada (enmendada por ADR-114, ADR-116 y ADR-121)
- Fecha: 2026-09-19
- Relacionadas: ADR-011, ADR-012, ADR-072, ADR-080
- Enmienda: ADR-011 (el guard de ADMIN aplica la regla de licencia)

## Contexto

[ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md) dejó escrito que las server actions viven en `src/app/**/actions.ts`, 51 archivos. La [auditoría del 2026-09-19](../auditoria-codigo-2026-09-19.md) midió lo que eso costaba sin un lugar común: cada archivo se escribía sus propios ayudantes. `npm run audit:metrics` contaba 44 copias de `single`, 23 de `text`, 13 de `requireAdmin`, 8 de `withQuery`, 5 de `safeBack` y 10 de `back`.

Copiar no era lo grave. Lo grave es que las copias **no eran iguales**, y la diferencia no se veía:

- Dos de las 23 `text` no recortaban. Una está en `app/ajustes/actions.ts` y lee las contraseñas (`current`, `password`, `confirmation`): ahí el espacio es parte del dato. Quien hubiera «unificado» a la versión mayoritaria habría dejado afuera a cualquiera con un espacio en su contraseña.
- Las cinco `safeBack` aplicaban cuatro reglas distintas para decidir a dónde se puede volver tras una action.
- `requireAdmin` local exigía `assertAdmin` —ADMIN **y** en condición de operar—, mientras `requireAdminActor` de `identity`, que ya existía y usaban 5 archivos, solo miraba `isAdmin`. Con actores reales da lo mismo, porque la sesión ya vacía los permisos de quien está en licencia; pero eran dos reglas para la misma puerta.

Y apareció un defecto de verdad. `runCommand` escribe en la auditoría `actor.ip ?? null`. El actor se armaba a mano en cada action, y se armaba de tres formas: con la IP; como `{ personId }` sin ella, a veces escondido en un ayudante local (`actorFor`); o pasando el actor de sesión entero, que tampoco la trae. Medido con el comprobador de tipos de TypeScript sobre `main` (`24beeb7`), en las 178 llamadas a un comando `*As` con actor: **64 dejaban la fila de auditoría sin IP**, y no eran las menores. Entre ellas: conceder un permiso, anonimizar a una persona, cambiar el estado de su membresía, sancionar y revocar una sanción, aplicar la importación del roster, decidir una solicitud, publicar y despublicar normativa, **emitir el enlace de acceso de una persona**, dar de alta, pedir el borrado de los datos propios y **registrar o revocar un consentimiento**, donde la IP es parte de la evidencia.

## Decisión

1. **Las actions comparten un kit en `src/app/_lib/`**, sin JSX y sin reglas de negocio:
   - `form.ts`: `formText` (recorta), `formRaw` (no recorta: contraseñas y cualquier valor donde el espacio es dato) y `formOptional` (recortado, o `undefined`).
   - `search.ts`: `single`, `withQuery` y `safeBack`.
   - `actor.ts`: `actorContext`, `sessionActorContext` y `requireAdminContext`.
2. **El actor de un comando se arma con `actorContext(actor)`**, que devuelve quién ejecuta y desde qué IP, y nada más de la sesión. Armarlo a mano como `{ personId }`, o pasar el actor de sesión, deja de ser una forma válida en una action.
3. **`sessionActorContext(actor)`** hace lo mismo conservando la sesión, para los comandos que además autorizan con ella y por eso no aceptan el actor mínimo (hoy `rotateCarnetTokenAs`, que llama a `assertAdmin`). El compilador decide cuál hace falta: pasar el actor mínimo a uno de esos comandos no compila.
4. **Una sola regla para volver**: `safeBack(valor, área, respaldo)` acepta una ruta propia, de caracteres seguros, sin `//`, y dentro del área dada (`/admin`, `/app` o una sección); todo lo demás cae en el respaldo. Reemplaza las cuatro reglas anteriores.
5. **Un solo guard de ADMIN.** Las 13 copias de `requireAdmin` pasan a `requireAdminActor` de `identity`, y ese guard aplica la regla de `assertAdmin`: una concesión guardada no habilita operaciones mientras la persona está en licencia. Es una segunda barrera detrás de la sesión, no un cambio para nadie real. `requireAdminContext(returnTo)` junta guard y actor para las actions que no necesitan nada más.
6. **Las diez `back` de ruta siguen existiendo**, porque cada una nombra la ruta de su pantalla, pero delegan en `withQuery` en lugar de armar la consulta a mano.
7. **Tres actores sin IP son deliberados y se quedan así.** La respuesta a la encuesta tras una ocasión es anónima por diseño (ADR-038): sumarle la IP iría contra eso. Y en las dos rutas de presign `{ personId }` no es el actor de un comando, es el dueño de la subida.

## Consecuencias

- La auditoría de esas acciones registra la IP desde este cambio: de 64 llamadas sin IP queda una, la encuesta anónima. Las filas anteriores quedan como están: no hay de dónde reconstruirla.
- La medición usa el `tsconfig` del proyecto y el comprobador de TypeScript, no una búsqueda de texto: marca toda llamada `…As(actor, …)` cuyo primer argumento tiene `personId` y no tiene `ip` en su tipo.
- `npm run audit:metrics`: `requireAdmin` de 13 a 0, `text` de 23 a 0, `single` de 44 a 0, `withQuery` de 8 a 0 y `safeBack` de 5 a 0. Las 10 `back` siguen contándose porque siguen declaradas, ya como una línea.
- `tests/unit/document-publication-action.test.ts` simulaba el guard. Ahora simula la sesión y deja correr el `requireAdminActor` real, así que «el ADMIN en licencia no publica» prueba la regla y no su imitación; de paso afirma que la IP llega al dominio.
- `safeBack` admite algunos caracteres que la regla vieja del admin no admitía (`.`, `_`, `~`, `+`) y es más estricta que la vieja de Mi OE, que aceptaba cualquier cosa tras `/app/`. Ninguna ruta interna usa otra cosa; sigue sin poder salir del origen ni del área.
- No cambia ninguna pantalla ni ningún texto.

## Lo que queda de R3

Este es el tramo R3-A. Siguen en R3-B, porque tocan otros archivos y otro riesgo: la tabla única de navegación del admin, `register<T>` en el registro del kit, `DomainError` fuera del admin-kit, `dates-pure`, reunir la autorización compuesta en `src/app/_authz/` y los bloques `try/catch DomainError` repetidos, que van con el paso de mensajes a códigos de error en la URL (R6).

## Enmienda (2026-10-07, ADR-114)

La regla 4 decía que `safeBack` acepta una ruta propia, de caracteres seguros, sin `//` y dentro del área. «Dentro del área» se comprobaba sobre el texto, y una ruta que empieza por el área y sube con `..` o con `%2e%2e` pasaba: `/admin/../api/mis-datos` salía del filtro y `withQuery` la dejaba en `/api/mis-datos`. [ADR-114](ADR-114-reglas-de-seguridad-privacidad-e-integridad.md) regla 1 lo cierra: la ruta la decide `internalPath`, la regla que `safeBack` comparte con el destino del ingreso y con la pantalla que nombra una descarga, y que rechaza los segmentos `.` y `..`, también codificados, sobre la ruta que el navegador va a pedir. Los caracteres seguros y el `//` quedan como estaban, y ni la firma ni los llamadores cambian.

## Enmienda (2026-10-08, ADR-116)

La regla 2 decía que armar el actor a mano «deja de ser una forma válida en una action», y la primera consecuencia que «de 64 llamadas sin IP queda una». Las dos miraban las actions. Lo que se escribe por el admin kit pasa por los cierres de cada recurso (`create`, `update` y `runRowAction`, en el `admin.ts` de su módulo), que recibían `{ personId, isAdmin }` y volvían a armar `{ personId }` para `runCommand`: 51 llamadas en 22 recursos, entre ellas conceder y revocar permisos, con la auditoría sin IP. [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 10 lo cierra: el kit arma el actor con `actorContext` y el recurso lo entrega entero. Lo demás de la regla queda igual.

## Enmienda (2026-10-10, ADR-121)

La regla 2 decía que armar el actor a mano como `{ personId }` «deja de ser una forma válida en una action». Era una convención de las actions: `Actor.ip` seguía siendo opcional, así que `{ personId }` compilaba en cualquier otro sitio (un comando del dominio, un trabajo, un script) y su auditoría salía sin IP sin que nada lo señalara (DT-177). [ADR-121](ADR-121-reglas-de-estructura-y-pruebas-del-noveno-ciclo.md) regla 1 lo pasa al tipo: `Actor.ip` es `string | null`, nunca ausente, y un actor sin IP no compila en ningún lado. La regla 3 queda igual, y `rotateCarnetTokenAs` declara ahora que recibe la sesión con su IP. De los tres actores sin IP de la regla 7, la encuesta escribe su `ip: null` a la vista, con esa regla citada al lado; en las dos rutas de presign `{ personId }` sigue sin ser el actor de un comando.
