# ADR-121: Reglas de estructura y pruebas del noveno ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-10
- Relacionadas: ADR-011, ADR-012, ADR-038, ADR-082, ADR-109, ADR-116, ADR-119
- Enmienda: ADR-082 (regla 2: la IP del actor la exige el tipo en todo comando, no solo la convención de las actions) y ADR-116 (regla 10: la guarda de texto de los recursos del admin kit se retira y queda el compilador)

## Contexto

El noveno ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) toma una segunda tanda de filas diferidas del ledger que no esperan nada: ni una decisión del dueño, ni una mirada a producción, ni mezclar la pila (spec [#256](https://github.com/Mateoloperaortiz/LaOE/issues/256)). Lo que es estructura va con su caracterización en verde sobre el código anterior, en su propio commit, antes de tocar; lo que roza una decisión abierta conserva la conducta de hoy.

**La IP del actor de un comando era opcional (DT-177).** `Actor` (`src/db/tx.ts`) declaraba `ip?: string | null` y `runCommand` escribía `actor.ip ?? null` en la auditoría: un actor armado a mano como `{ personId }` compilaba, y su auditoría salía sin IP sin que nada lo señalara. Se había cerrado tres veces, sitio por sitio: [ADR-082](ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md) para las actions, [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 10 para el admin kit y [ADR-119](ADR-119-reglas-de-estructura-y-robustez-del-septimo-ciclo.md) regla 18 para los exportes. En el admin kit lo vigilaba una guarda de texto (`tests/unit/admin-kit-command-actor.test.ts`), que el revisor del ticket #178 evadió con otro nombre de parámetro; fuera del kit no había nada.

El ancho se midió antes de tocar, con el campo ya obligatorio y `npm run typecheck`: 922 errores, 10 en `src` (8 archivos), 6 en `scripts` (3 archivos) y 906 en `tests` (86 archivos). De los 16 de `src` y `scripts`, 13 señalan un actor y 3 son su eco en la línea de al lado. La cuenta de literales `{ personId: … }` que traía la fila (100 en 52 archivos) no medía esto: casi todos son otra cosa, o ya pasan por `actorContext`.

## Decisión

1. **La IP del actor de un comando es obligatoria en el tipo.** `Actor.ip` es `string | null`, nunca ausente, y `SYSTEM_ACTOR` la lleva en `null`. Quien arma un actor dice de dónde saca la IP o escribe `null` a la vista; `runCommand` escribe en la auditoría la que recibe, sin suplir la que falta.
   - **De dónde sale.** En una action, una ruta y el admin kit, de `actorContext` o `sessionActorContext` (`src/app/_lib/actor.ts`), como ya decía ADR-082 regla 2. `rotateCarnetTokenAs` declara ahora lo que ya recibía: la sesión con la IP del request. En el envío de un formulario la IP no viaja en el actor sino en el envío: `submitFormAs` recibe a quien responde (id, correo y nombre, o nadie) y `SubmitInput.ip` pasa a ser obligatoria, porque de ahí salen el actor del comando, el tope por IP y la fila de la respuesta.
   - **Los `null` que quedan escritos, cada uno con su motivo al lado.** Donde no hay request: los trabajos del poller que actúan a nombre de quien originó el evento (la tarjeta que nace de una respuesta, la inscripción aceptada que entra al grupo y las decisiones del cierre de permanencia) y los scripts (la importación histórica de GH Points, la de la normativa y las semillas). Donde actúa el sistema a nombre de la persona: la evidencia automática del onboarding. Donde es a propósito: la respuesta a la encuesta, anónima por diseño (ADR-082 regla 7). Y uno que no es ninguna de las tres cosas: la baja de campañas por el token del correo, que tiene request y no recibe su IP. Se queda como está y queda anotada (DT-313).
   - **Lo que no cambia.** Ninguna fila de `audit_log`: cada sitio escribe la IP que escribía, o el `null` que antes salía por omisión. De dónde se lee la IP del cliente (la primera de `X-Forwarded-For`) tampoco se toca.
   - **La guarda.** `tests/unit/admin-kit-command-actor.test.ts` se retira: un recurso que arma `{ personId }` ya no compila, se llame como se llame su parámetro. En su lugar `tests/unit/command-actor-type.test.ts` afirma el tipo, y la juzga `npm run typecheck`: si alguien vuelve opcional el campo, ese archivo deja de compilar.
   - **Lo que el tipo no ve.** Una puerta que tiene request y escribe `ip: null` a mano compila. Antes se omitía sin que se notara; ahora hay que escribirlo, y se lee en la revisión. La guarda de texto solo reconocía dos formas de escribirlo.
   - **Prueba.** `tests/integration/command-actor-ip.test.ts`, contra `audit_log` y por la puerta: una action (revocar el carnet propio) y una ruta (registrar un dispositivo para push) auditan con la IP del request; un trabajo (la inscripción aceptada que entra al grupo) audita a nombre de quien aceptó y sin IP, mientras el comando que aceptó sí la lleva; y la baja por token audita sin IP.

## Consecuencias

- Un actor nuevo no se puede armar sin decir su IP, en `src`, en `scripts` ni en una prueba: las fábricas de las pruebas escriben `ip: null`. Lo que ADR-119 regla 18 decía de los exportes (DT-176) queda forzado por el compilador y no por la firma de dos funciones.
- No cambia ninguna pantalla, ningún texto ni ninguna fila de auditoría, y no hay migración.
- La baja de campañas por el token del correo sigue auditando sin IP (DT-313). El clic único lo hace el cliente de correo, así que la IP que llegue puede ser la del proveedor y no la de la persona: por eso no se resolvió de paso.
- El ancho real fue menor que el que temía la fila: 13 sitios en `src` y `scripts`. Lo ancho eran las pruebas, que se arreglaron con un recorrido mecánico sobre los errores del compilador, sin tocar expectativas.
