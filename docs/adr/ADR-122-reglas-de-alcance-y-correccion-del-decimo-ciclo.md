# ADR-122: Reglas de alcance y corrección del décimo ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-10
- Relacionadas: ADR-035, ADR-036, ADR-037, ADR-058, ADR-059, ADR-060, ADR-085, ADR-109, ADR-112, ADR-114, ADR-116, ADR-119
- Enmienda: ADR-072 (regla 1: el alcance que llega con un id ya no es solo la tabla de permanencia, la convocatoria o el alcance de una sanción; lo reciben también la asistencia, el aval, el cargo, la nota, la tarea, la tarjeta y la etapa, cada uno con el objeto de su página)

## Contexto

El décimo ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) toma una tercera tanda de filas diferidas del ledger que no esperan nada: ni una decisión del dueño, ni una mirada a producción, ni mezclar la pila (spec [#273](https://github.com/Mateoloperaortiz/LaOE/issues/273)). Cada defecto se reprodujo con una prueba en rojo antes de corregirlo. Esta ADR reúne las reglas que cambian en el ciclo: cada ticket suma la suya.

**Nueve comandos recibían un id hijo sin el objeto de su página (DT-146, inciso b).** [ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md) regla 1 dice que un id elegido por el cliente llega con el alcance que autorizó `src/app`, y se aplicó a los criterios, los puntajes, las inscripciones y, con [ADR-112](ADR-112-toda-sancion-declara-su-alcance.md) y [ADR-114](ADR-114-reglas-de-seguridad-privacidad-e-integridad.md) regla 3, a las sanciones. La auditoría de huecos del 2026-10-07 contó cinco acciones de ADMIN que seguían mandando solo el id hijo; el inventario de este ciclo, leyendo cada `actions.ts` que vive bajo una ruta con padre, dio nueve comandos. Un formulario viejo, o armado en la consola del navegador, de la página A con el id de un hijo de B operaba sobre B y la pantalla volvía a A con «guardado», que es la que se revalida:

- `decideCheckInAs` recibía la asistencia sin su ocasión: desde la consola de una ocasión se aprobaba o se anulaba, con su crédito, la asistencia de otra.
- `decideEventApprovalAs` recibía el aval sin el presupuesto de la página.
- `removeAppointmentAs` recibía el cargo solo: desde la ficha de una persona se quitaba el de otra, y desde la mesa de un macroevento, cualquier cargo de junta. La página del macroevento sí lo comparaba con su mesa antes de llamar; la de la edición no.
- `editNoteAs` y `completeTaskAs` recibían la nota y la tarea sin la persona de la ficha.
- `updateCardAs`, `admitFromCardAs`, `moveStageAs` y `deleteStageAs` recibían la tarjeta o la etapa sin el pipeline: desde un pipeline se daba de alta a la persona de una tarjeta de otro.

En todos el actor ya era ADMIN, así que no había escalada: el daño era operar sobre un objeto distinto del que la pantalla mostraba. Pero la comprobación tiene que existir antes del primer llamador que no sea una pantalla de ADMIN, que es la API que [ADR-085](ADR-085-plataforma-oe-digital-un-backend-y-frontends-delgados.md) planea para los frontends.

**Dos comandos con alcance de comité le creían a quien los llamaba (DT-146, inciso c).** `scoreCriterionAs` recibía `inCommittee`, un booleano que la action calculaba mirando el roster, y con él decidía si la persona se podía puntuar. `grantRecognitionAs` recibía un comité y una persona y no comprobaba que la una fuera del otro: lo hacía solo la pantalla del líder. Hoy no era explotable, porque las dos actions comprueban; un llamador nuevo con el comité A y una persona del comité B habría publicado un anuncio con su nombre en la cartelera de A, o le habría dejado un puntaje en la tabla de A.

## Decisión

1. **Un id hijo llega con el objeto de su página, y el comando lo comprueba en su transacción.** Es [ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md) regla 1 con el molde de [ADR-112](ADR-112-toda-sancion-declara-su-alcance.md): el alcance es un parámetro obligatorio, sin valor por omisión, y el comando lo compara con la fila que lee. Uno ajeno se trata como inexistente: responde T-032, el mismo texto que ya usaban esas reglas, sin mutación, auditoría ni evento. Falla cerrado: un alcance ausente, vacío o que no se reconoce también responde T-032, aunque el tipo ya no lo deje compilar.

   | Comando | Objeto de la página | Qué compara |
   | --- | --- | --- |
   | `decideCheckInAs(actor, { occasionId, checkInId, … })` | La ocasión de la consola | La ocasión de la asistencia, dos veces: en la primera lectura, sin candado, y si no coincide termina ahí, sin tomar nada de la otra ocasión; y otra vez con la fila ya tomada por `lockCheckIns`. No toma candados nuevos ni cambia su orden ([ADR-119](ADR-119-reglas-de-estructura-y-robustez-del-septimo-ciclo.md) reglas 1 a 5) |
   | `decideEventApprovalAs(actor, approvalId, input, { budgetId })` | El presupuesto de la página | El comité del presupuesto con el comité del aval, que se toma `for update` como antes. La página lista los avales del comité de su presupuesto, no los ligados a ese presupuesto (`getBudgetSummary`), y el comando acepta exactamente lo que la página muestra. Un presupuesto que no existe no decide nada |
   | `removeAppointmentAs(actor, appointmentId, owner)` | `{ personId }` desde la Persona 360 o `{ editionId }` desde la mesa del macroevento | La persona o la edición del cargo. El dueño es uno de los dos: los dos a la vez, o ninguno, se rechazan |
   | `editNoteAs(actor, noteId, body, { personId })` | La persona de la ficha | La persona de la nota |
   | `completeTaskAs(actor, taskId, { personId })` | La persona de la ficha | La persona de la tarea |
   | `updateCardAs` y `admitFromCardAs(actor, cardId, input, { pipelineId })` | El pipeline de la página | El pipeline de la tarjeta, ya tomada, antes de editar o de admitir |
   | `moveStageAs(actor, stageId, direction, { pipelineId })` y `deleteStageAs(actor, stageId, { pipelineId })` | El pipeline de la página | El pipeline de la etapa |

   `completeTask`, sin alcance, queda para quien trae el id de su propia fila y no tiene ficha: la solicitud que cierra su tarea (`crm/domain/requests.ts`) y la bandeja de tareas del admin kit (`crm/admin.ts`), que opera sobre todas. El comando de la ficha es `completePersonTask`.

   No se tocó el que ya comprobaba: `saveStageAs` compara la etapa con el pipeline que recibe; `moveCardAs` compara la etapa de destino con el pipeline de la tarjeta, y su action no recibe pipeline de la página, lo saca de la tarjeta; `revokeSanctionAs` ([ADR-114](ADR-114-reglas-de-seguridad-privacidad-e-integridad.md) regla 3), `decideEntryAs` (ADR-072 regla 5) y `decideExcuseForCommitteeAs` ([ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) regla 5) ya reciben su alcance. `decideManyAs`, el lote de la consola, no recibe ids del cliente: la action los lee de la ocasión de la página.

2. **Que una persona sea de un comité lo lee el comando; nadie se lo declara.** Los dos comandos lo preguntan dentro de su transacción con `isInInternalRoster` (`people`), que es la regla de `listInternalRoster`, la que aplicaban las pantallas: pertenencia viva en ese comité y ese término, persona sin anonimizar y membresía en un estado del directorio. La consulta del roster y la pregunta comparten la condición (`inRosterOf`), así que no pueden separarse.

   - `scoreCriterionAs(actor, ref, input, names)` ya no recibe `inCommittee`. Con el criterio ya filtrado por la tabla de la página (ADR-072 regla 4), lee si la persona está en el roster del comité y el término de ese criterio; si no, responde T-776 como antes, sin escribir. `names` trae solo los dos nombres de ese texto. La tabla general no tiene comité y sigue sin tener a quién puntuar.
   - `grantRecognitionAs`: un reconocimiento que llega con comité es de alguien que está en el roster de ese comité en ese término. Si no, responde T-032 y no escribe anuncio, reconocimiento, interacción, auditoría ni evento. Sin comité, como el Premio OE que GH otorga desde la Persona 360, no se pide pertenencia a ninguno. La pantalla del líder conserva su comprobación previa, con su texto (T-260).

   No hay candado nuevo. La regla es leer y escribir, no contar y escribir: si la persona sale del comité mientras el líder la puntúa, lo que queda es lo mismo que si el puntaje hubiera entrado un instante antes de la salida.

## Consecuencias

- Cambian las firmas de los nueve comandos de la regla 1 y la de `scoreCriterionAs`. Todos sus llamadores pasan el alcance: las seis pantallas (`ocasiones/[id]`, `presupuestos/[id]`, `personas/[id]`, `pipelines/[id]`, la mesa de la edición y la del macroevento), la tabla de permanencia del comité y las pruebas. Las pruebas de participación que no tratan del alcance deciden con `decideInOwnOccasion` (`tests/helpers/check-ins.ts`), que manda la ocasión de la propia asistencia, como hace la consola.
- `moveStageAction` ahora vuelve a la página con el error del dominio. Antes no lo atrapaba, y una etapa que no existía terminaba en la pantalla de error.
- No hay migración ni texto nuevo: T-032 y T-776 ya existían.
- DT-146 sigue diferida por lo que no entró. El inciso (a), la vista previa de importar miembros a un grupo, espera la decisión abierta 57. Del inciso (c) quedan, sin decisión que esperar, tres comandos de `finance` (`submitPrerequestAs`, `recordExpenseAs` y `recordTransferAs`), que reciben el presupuesto sin el comité de la página: lo liga `financeOf` en `src/app/admin/comites/[slug]/actions.ts`. Y `decideManyAs` acepta asistencias de varias ocasiones; acotarlo a una toca el orden de candados de ADR-119 regla 1. Del inciso (b) quedan dos acciones del pipeline, `addCardNoteAction` y `createCardTaskAction`, que leen la tarjeta por su id y no la comparan con el pipeline de la página; ahí el comando recibe la persona, no la tarjeta.
- Pruebas, cada una en rojo sobre el código anterior: `tests/integration/participation-checkin-occasion-scope.test.ts`, `finance-approval-scope.test.ts`, `people-appointment-owner.test.ts`, `crm-person-scope.test.ts`, `crm-pipeline-scope.test.ts`, `permanence-score-committee-scope.test.ts` y `crm-recognition-committee-scope.test.ts`.
