import { getDb } from "@/db/client";
import { membershipChanged, personAnonymized } from "@/domain-events/people";
import { onEvent } from "@/jobs/registry";
import { purgeIfMembershipEnded } from "@/modules/people";
import { deleteSubmissionsFor } from "./domain/submissions";

// Al salir de la OE o anonimizarse se borran las respuestas de formularios (ADR-030, ADR-037 regla 4).
// En la baja, solo si sigue vigente cuando corre el evento (ADR-118 regla 5): uno atrasado no se lleva
// las respuestas de quien ya volvió.

onEvent(membershipChanged, async ({ personId, to }, ctx) => {
  if (to !== "INACTIVE") {
    return;
  }
  const deleted = await purgeIfMembershipEnded(personId, (command) =>
    deleteSubmissionsFor(command.tx, personId),
  );
  if (deleted === null) {
    ctx.log.info({ personId }, "baja atrasada: la persona ya volvió y conserva sus respuestas");
    return;
  }
  ctx.log.info({ personId, deleted }, "respuestas de formularios borradas al salir");
});

onEvent(personAnonymized, async ({ personId }, ctx) => {
  const deleted = await deleteSubmissionsFor(getDb(), personId);
  ctx.log.info({ personId, deleted }, "respuestas de formularios borradas por anonimización");
});
