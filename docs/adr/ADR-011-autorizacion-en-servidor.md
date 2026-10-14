# ADR-011: Autorización en servidor

- Estado: Aceptada (enmendada por ADR-051, ADR-058, ADR-072, ADR-082, ADR-089, ADR-112 y ADR-119)
- Fecha: 2026-09-02
- Relacionadas: ADR-010, ADR-017

## Contexto

Una cookie presente no prueba nada: puede estar vencida, revocada o pertenecer a una persona retirada. Los cargos de la OE (líder, junta) cambian cada semestre y no deben confundirse con derechos técnicos.

## Decisión

El proxy solo redirige rutas protegidas cuando no hay cookie y emite la CSP; nunca decide roles. `getActor()` (cacheado por request) valida sesión, estado de membresía y permisos. Cada comando sensible llama `requireAdmin()` o `requireLeader(committeeId)` al inicio; los layouts hacen lo mismo para la UI, pero no sustituyen al dominio. `Permission` (`ADMIN`, `COMMITTEE_LEADER` con comité) es técnico y se concede desde la ficha de la persona con step-up; `Appointment` es el cargo visible con historia. No se puede retirar el último `ADMIN` habilitado.

## Consecuencias

- Layouts y acciones comparten una sola verdad.
- Un líder ve el roster de sus comités (sin correo), propone ocasiones en borrador y usa el modo anfitrión; no aprueba puntos ni publica contenido.

## Enmienda (2026-09-10, ADR-051)

El step-up deja de equivaler a "un OTP verificado hace menos de 15 minutos" y pasa a ser "una credencial propia verificada hace menos de 15 minutos": la contraseña del actor estampa la misma marca de sesión que estampaba el código. La ventana de 15 minutos, los guards y la lista de acciones que lo exigen no cambian. Ver [ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md).

## Enmienda (2026-09-12, ADR-058)

Los cargos de la OE siguen sin ser permisos técnicos, pero un cargo de dirección del comité (`committee_role.isLeadership`, con las capacidades que declara el catálogo) sí habilita, por datos y solo sobre su comité, lo de su área: Personas, Actividades, Comunicación, Aliados o Finanzas según el cargo. El guard no vive en `identity` sino en `src/app/admin/comites/_kit/capacidades.ts`, y las guardas finas en el dominio de `people`. `COMMITTEE_LEADER` queda como excepción con todas las capacidades del comité. Ver [ADR-058](ADR-058-direccion-del-comite-por-areas.md).

## Enmienda (2026-09-16, ADR-072)

Que la página autorice un alcance no basta si el comando recibe un id suelto. Toda orden que recibe el id de un objeto elegido por el cliente recibe también el alcance autorizado (una tabla de permanencia, una convocatoria), y el dominio comprueba dentro de la transacción que el objeto pertenezca a él; uno ajeno se responde como inexistente, sin mutación, auditoría ni evento. ADMIN también declara el alcance. La paleta ⌘K y `GET /api/admin/buscar` son solo de ADMIN. Ver [ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md).

## Enmienda (2026-09-19, ADR-082)

`requireAdminActor` aplica la misma regla que `assertAdmin`: ADMIN y en condición de operar; una concesión guardada no habilita el área de administración mientras la persona está en licencia. Las server actions dejan de tener su propia copia del guard. El actor que una action entrega a un comando se arma con `actorContext(actor)`, que lleva la IP del request a la auditoría. Detalle en [ADR-082](ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md).

## Enmienda (2026-09-23, ADR-089)

Por datos y solo sobre la competencia The Games de su edición, el cargo de Dirección de The Games (`MACROEVENT_DIRECTOR` con `roleCode='THE_GAMES'`, titular o codirección) habilita lo mismo que un operador: equipos, bases, calendario, rotaciones, resultados, anuncios y apuestas. También la tienen las personas asignadas como operador o juez en `competition_staff`; el juez, solo en su base. Ninguno de esos roles da acceso a datos personales. `Permission` no gana códigos, y el cargo sigue sin ser un permiso técnico. El guard vive en `src/app/_authz/competition.ts`, y el dominio de `competition` relee el alcance dentro de la transacción. Ver [ADR-089](ADR-089-the-games-competencia-por-equipos.md).

## Enmienda (2026-10-09, ADR-119)

La decisión dice que «cada comando sensible llama `requireAdmin()` o `requireLeader(committeeId)` al inicio». Ya no describe el código: esas dos funciones no existen con ese nombre, y dónde se comprueba el permiso lo fueron moviendo las enmiendas de arriba y [ADR-112](ADR-112-toda-sancion-declara-su-alcance.md) regla 6, que cambió la regla para las sanciones sin dejar su sección acá. Dicho junto, hoy es así:

- **La capacidad del actor la comprueba quien recibe el request.** La server action o la ruta, antes de llamar al comando, con `requireAdminActor` o `requireAdminContext` ([ADR-082](ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md) regla 5) o con un guard de `src/app/_authz/` (`admin-area`, `committee`, `competition`, `group` y `occasion`). Los layouts y las páginas llaman a los mismos guards para la UI y no sustituyen a la action.
- **El comando de dominio comprueba el alcance, no la capacidad.** La action arma el alcance después de autorizar, y el comando verifica dentro de la transacción que el objeto pertenezca a él ([ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md); [ADR-112](ADR-112-toda-sancion-declara-su-alcance.md) regla 6). Donde el alcance se declara, es obligatorio y falla cerrado: ADMIN también lo declara (`{ by: "ADMIN" }`), y uno que falta o no se reconoce se rechaza ([ADR-113](ADR-113-reglas-de-seguridad-e-integridad.md) regla 5).
- **En cuatro sitios el dominio sí se defiende solo**: el permiso es un cargo o una asignación que está en los datos y el comando lo relee aunque la action ya lo haya comprobado, o el comando llama a un guard.

  1. La dirección del comité, en `people` ([ADR-058](ADR-058-direccion-del-comite-por-areas.md)): `requireDirection` (`src/modules/people/domain/committee-direction.ts`) relee de los datos, dentro de la transacción, la dirección de quien actúa y exige la capacidad pedida.
  2. `competition` ([ADR-089](ADR-089-the-games-competencia-por-equipos.md)): `assertOperator` y `assertCanRecordAt` (`src/modules/competition/domain/access.ts`) releen de los datos si quien actúa opera la competencia, la dirige o es juez de esa base, y las órdenes que son solo de ADMIN o de la Dirección lo exigen ahí mismo (`setup.ts`, `staff-import.ts` y `captains.ts`).
  3. La evaluación de un grupo de trabajo, en `permanence`: `evaluate` (`src/modules/permanence/domain/evaluations.ts`) exige que quien actúa sea evaluador del grupo si no llega declarado como ADMIN. Los evaluadores los lee `loadEvaluationContext` de los datos, antes de abrir la transacción.
  4. La rotación del carnet de otra persona, en `identity`: `rotateCarnetTokenAs` (`src/modules/identity/domain/carnet-token.ts`) llama a `assertAdmin` cuando el carnet no es del actor ([ADR-082](ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md) regla 3). Es el único comando que llama a un guard de `identity`.

  En los tres primeros, que el actor es ADMIN llega declarado por quien autorizó (`isAdmin`, `allCapabilities`): `people`, `competition` y `permanence` no dependen de `identity` (`MODULE_DEPS`) y no leen `Permission`. No cuentan como sitio las reglas que usan esa capacidad declarada sin releer nada (`saveMacroeventMemberAs` la exige; `resolveEvidenceRedirect` entrega al autor o a ADMIN; `resolveDocumentRedirect` muestra un borrador solo a ADMIN) ni las comprobaciones de lo propio, que son reglas de dominio y no capacidad.

Lo que esto implica y no estaba escrito: fuera de esos cuatro sitios, un comando llamado sin pasar por una action o una ruta (un script, un job, una prueba) no comprueba la capacidad de su actor; quien lo llama responde por ella. Lo demás de la decisión no cambia: el proxy no decide roles, `getActor()` valida sesión, estado de membresía y permisos, y un cargo no es un permiso técnico. Esta enmienda no mueve ningún guard ni toca la [decisión abierta 7](../decisiones-abiertas.md) (si quien dirige un comité y está en licencia conserva sus capacidades). La lista sale de un barrido con `rg` del día, no de una auditoría. Ver [ADR-119](ADR-119-reglas-de-estructura-y-robustez-del-septimo-ciclo.md) regla 22.
