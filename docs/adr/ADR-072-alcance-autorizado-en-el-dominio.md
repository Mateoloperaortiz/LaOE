# ADR-072: El alcance autorizado se verifica en el dominio

- Estado: Aceptada; publicación pendiente
- Fecha: 2026-09-16
- Enmienda: ADR-011
- Relacionadas: ADR-017, ADR-035 (regla 15), ADR-036 (reglas 3 y 7), ADR-037 (regla 10), ADR-058 (reglas 4 y 5), ADR-060 (regla 5)

## Contexto

El 2026-09-16, al revisar si los cargos de mesa quedan limitados a su área (ADR-058), apareció que las páginas y las acciones exigen la capacidad correcta, pero varios comandos reciben el id de un objeto elegido por el cliente y el dominio nunca comprueba que ese objeto pertenezca al alcance que se autorizó:

1. **Criterios de permanencia.** `updateRuleAs` y `deleteRuleAs` recibían solo el id y tomaban la tabla de la fila guardada. Con la capacidad `PERMANENCE` en un comité, cambiando el id oculto del formulario o el parámetro `regla` de `/admin/comites/[slug]/permanencia`, que abría cualquier criterio en el editor, se podía editar o borrar un criterio de otro comité o de la tabla general, que GH normalmente no bloquea. Esos criterios deciden quién sigue en la OE.
2. **Puntajes del líder.** `scoreCriterionAs` comprobaba que la persona estuviera en el comité, pero aceptaba un criterio `LEADER_SCORE` de cualquier tabla o término. Como `leader_score` es único por regla y persona, se podía pisar el puntaje que puso otro comité.
3. **Convocatorias internas.** `decideEntryAction` comprobaba que el actor liderara el grupo de la convocatoria de la URL, pero `decideEntryAs` decidía cualquier inscripción. Aceptar una ajena metía a la persona en el grupo de esa otra convocatoria.
4. **Paleta ⌘K.** `GET /api/admin/buscar` respondía a ADMIN, a `COMMITTEE_LEADER` y a cualquier cargo de dirección: nombres de toda la tabla de personas (prospectos, egresados y contactos externos) y ocasiones de todos los comités. Como también busca por correo, confirmaba si un correo está registrado. La paleta solo se muestra a ADMIN.

Ninguno de los cuatro contradice una regla escrita. ADR-036 regla 7 ya limita los puntajes a la regla `LEADER_SCORE` del comité del actor, ADR-037 regla 10 deja las inscripciones al líder de su grupo, ADR-035 regla 15 deja el kit para ADMIN y ADR-058 regla 4 pide que las guardas relean los datos. El defecto es que `src/app` autorizaba un alcance (un comité, una convocatoria) y el comando recibía un id suelto que nadie comparaba con ese alcance. El precedente correcto ya existía: `decideExcuseForCommitteeAs` recibe el comité y rechaza la excusa de una ocasión ajena (ADR-060 regla 5).

## Decisión

1. **Un id llega con su alcance.** Toda orden que recibe el id de un objeto elegido por el cliente, desde un formulario o una URL, recibe también el alcance que autorizó `src/app`: la tabla de permanencia o la convocatoria. El dominio relee el objeto dentro de la transacción filtrando por ese alcance. Uno ajeno se trata como inexistente: el mismo texto, sin mutación, auditoría ni evento. ADMIN también declara el alcance: poder operar sobre todo no lo exime de decir sobre qué opera.
2. **Criterios.** `updateRuleAs(actor, ref, id, …)` y `deleteRuleAs(actor, ref, id, …)` reciben la tabla (`TableRef`: término, ámbito y comité), y un criterio fuera de ella responde T-032. El cierre y el bloqueo se leen de esa tabla. Desde el comité solo se alcanza la tabla del término actual; ADMIN edita las de otros términos desde `/admin/permanencia/reglas`. La auditoría del borrado guarda término, ámbito y comité además de clave y peso.
3. **Editores.** `/admin/comites/[slug]/permanencia` y `/admin/permanencia/reglas` solo abren en el editor un criterio de la tabla que muestran.
4. **Puntajes.** `scoreCriterionAs(actor, ref, …)` recibe la tabla del comité. Un criterio de otro comité, de la tabla general o de otro término responde T-777, igual que uno inexistente.
5. **Inscripciones.** `decideEntryAs(actor, callId, entryId, …)` recibe la convocatoria, y una inscripción de otra responde T-032.
6. **Paleta ⌘K solo para ADMIN.** `GET /api/admin/buscar` responde 401 sin sesión y 403 a cualquier rol que no sea ADMIN, incluidos `COMMITTEE_LEADER` y la dirección por cargos. Las búsquedas que sí necesitan líderes y directores siguen en el servidor de su pantalla (modo anfitrión, consola, grupo y «Agregar miembro»), sin correos.

## Consecuencias

- Sin migración, sin textos nuevos (se reusan T-032 y T-777) y sin dependencias. Cambian cuatro firmas del dominio (`updateRuleAs`, `deleteRuleAs`, `scoreCriterionAs` y `decideEntryAs`) y sus llamadas; `getRule` deja de exportarse desde `permanence`.
- Los flujos legítimos no cambian: quien tiene `PERMANENCE` crea, edita y puntúa la tabla de su comité en el término actual, GH edita cualquier tabla desde Reglas y el líder de un grupo decide las inscripciones de sus convocatorias.
- Un formulario viejo o armado responde T-032 en lugar de actuar sobre otra tabla o de guardar parámetros leídos con el ámbito equivocado.
- Líderes y directores pierden una búsqueda global que ninguna pantalla les ofrecía.
- Un criterio `LEADER_SCORE` de la tabla general no se puede puntuar desde un comité, y tampoco se ofrecía. Si alguna vez hace falta, es otra decisión.
- La auditoría anterior permite saber solo en parte si alguien usó los huecos: las ediciones de criterios traen su tabla, los puntajes su regla y las decisiones su convocatoria, pero los borrados anteriores solo guardaban clave y peso, y las vistas de páginas y las búsquedas no se auditan.
- Pruebas: integración con objetos ajenos en criterios, puntajes e inscripciones (también para ADMIN), unitaria de la ruta del buscador y E2E del director que recibe 403 y del parámetro `regla` ajeno.
