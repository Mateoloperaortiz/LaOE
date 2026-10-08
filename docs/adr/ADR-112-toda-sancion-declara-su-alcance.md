# ADR-112: Toda sanción se registra con su alcance declarado

- Estado: Aceptada (enmendada por ADR-114 y ADR-116)
- Fecha: 2026-10-07
- Relacionadas: ADR-011, ADR-058, ADR-109
- Enmienda: ADR-060 (regla 6), ADR-072 (regla 1)

## Contexto

[ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) regla 6 dijo quién registra una sanción: ADMIN o quien tenga `PERMANENCE` en el comité (Regl. art. 69 par. 2). No dijo qué tipos registra el comité ni a quién. [ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md) regla 1 dijo que toda orden que recibe un id elegido por el cliente recibe también el alcance que autorizó `src/app`, que el dominio lo comprueba en la transacción y que ADMIN también lo declara. Nombró los comandos de criterios, puntajes e inscripciones; el de sanciones quedó afuera.

El resultado es la fila DT-002 del [ledger](../20-deuda-tecnica.md) ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)). La regla del comité vivía repartida: la página ofrecía tres tipos como lista permitida y la action rechazaba los otros dos como lista prohibida. `recordSanctionAs` recibía de un formulario el id de la persona y no comprobaba que fuera del comité de quien sancionaba.

El ciclo 1 llevó la comprobación al comando con un alcance opcional: con él sancionaba la dirección de un comité y sin él GH, sin restricción. La revisión de estándares del cierre marcó que opcional contradice ADR-072 regla 1: un llamador nuevo que lo olvidara quedaba, por omisión, con el alcance más amplio (fila DT-084).

## Decisión

1. **La dirección de un comité registra llamados de atención, faltas leves y faltas graves.** Son `WARNING`, `MINOR` y `MAJOR` (Regl. art. 69 par. 2). La suspensión explícita y la inhabilidad para cargos (`SUSPENSION` y `OFFICE_BAN`) las decide GH (Regl. art. 58, 62 y 63). La lista vive en un solo sitio, `COMMITTEE_SANCTION_KINDS`: la página ofrece los tipos desde ella y el comando responde T-260 a cualquier otro.
2. **Solo a un miembro vivo de su comité en el término del alcance.** El comando busca, en la transacción, la pertenencia de la persona a ese comité en ese término, sin fecha de salida. Quien es de otro comité, ya salió del suyo o fue del comité en otro término se trata como inexistente (ADR-072 regla 1): T-032, sin sanción, auditoría ni evento.
3. **La sanción queda a nombre del comité y del término del alcance.** El término y el comité que traiga la entrada no mandan: los pisa el alcance autorizado.
4. **Todo llamador declara su alcance, y ADMIN lo declara como tal.** `recordSanctionAs(actor, personId, input, scope)` exige un `SanctionScope`, que tiene dos formas: `{ by: "ADMIN" }` desde la Persona 360 y `{ by: "COMMITTEE", committeeId, termId }` desde la dirección de un comité. No hay valor por omisión: olvidarlo no compila, y un llamador sin tipos falla antes de escribir.
5. **El alcance de ADMIN no restringe tipo ni comité.** ADMIN registra los cinco tipos sobre cualquier membresía viva, con el término de la entrada y un comité opcional. El resto de ADR-060 regla 6 (duraciones, vigencia, efectos y revocación) no cambia.
6. **El alcance no autoriza: lo arma quien autorizó.** El comando comprueba que la persona y el tipo sean del alcance, no que el actor tenga la capacidad ([ADR-011](ADR-011-autorizacion-en-servidor.md)). La action del comité exige `PERMANENCE` en el comité de la ruta y arma el alcance con ese comité y el término actual; la de la Persona 360 exige ADMIN y declara `{ by: "ADMIN" }`.

## Consecuencias

- `SanctionScope` cambia de forma y `recordSanctionAs` y `recordSanction` de firma: el cuarto argumento es obligatorio. Lo declaran sus dos llamadores, las actions de `/admin/comites/[slug]/permanencia` y de `/admin/personas/[id]`. Sin migración, sin textos nuevos (se reusan T-032 y T-260) y sin cambios en rutas ni en eventos de dominio.
- Los flujos legítimos no cambian: la dirección sanciona a los miembros de su comité con sus tres tipos y GH sanciona a cualquier miembro vivo desde la Persona 360.
- Un formulario viejo o armado desde un comité responde T-032 o T-260 en lugar de sancionar a alguien ajeno o con un tipo de GH.
- **Queda abierto (DT-084).** Revocar una sanción recibe solo el id de la sanción: `revokeSanctionAs` no comprueba que sea de la persona de la página desde la que se revoca. Hoy la única action que lo llama exige ADMIN. Ni el formulario de faltas del comité ni las sanciones de la Persona 360 tienen E2E.
- Pruebas: `tests/integration/sanctions.test.ts` (los dos alcances; sin alcance no se registra nada; desde un comité, tipo de GH, persona de otro comité, persona que ya salió, persona de otro término, y el comité y el término que quedan escritos) y `tests/integration/inhabilities.test.ts`.

## Enmienda (2026-10-07, ADR-114)

Las consecuencias dejaban abierto (DT-084) que revocar una sanción recibía solo su id. [ADR-114](ADR-114-reglas-de-seguridad-privacidad-e-integridad.md) regla 3 lo cierra: `revokeSanctionAs` recibe la persona de la ficha desde la que se revoca y comprueba en la transacción que la sanción sea suya; una ajena responde T-032, como una que no existe, y no escribe nada. Sigue abierto de DT-084 que ni el formulario de faltas del comité ni las sanciones de la Persona 360 tienen E2E.

## Enmienda (2026-10-08, ADR-116)

La regla 4 hizo obligatorio el alcance al registrar y la regla 5 dejó la revocación como estaba: `revokeSanctionAs` no lo recibía, y que solo revocara ADMIN lo decidía la action (DT-101). [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 11 lo cierra: revocar declara el mismo `SanctionScope`, obligatorio, y el comando deja pasar solo `{ by: "ADMIN" }`. El alcance de un comité responde T-032, también sobre una sanción que ese comité registró: ninguna regla le da permiso para revocar. Lo demás queda igual.
