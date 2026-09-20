import { membershipChanged, personAnonymized } from "@/domain-events/people";
import { onEvent } from "@/jobs/registry";
import { deleteSubmissionsFor } from "./domain/submissions";

// Al salir de la OE o anonimizarse se borran las respuestas de formularios (ADR-030, ADR-037 regla 4).

onEvent(membershipChanged, async ({ personId, to }, ctx) => {
  if (to !== "INACTIVE") {
    return;
  }
  const deleted = await deleteSubmissionsFor(personId);
  ctx.log.info({ personId, deleted }, "respuestas de formularios borradas al salir");
});

onEvent(personAnonymized, async ({ personId }, ctx) => {
  const deleted = await deleteSubmissionsFor(personId);
  ctx.log.info({ personId, deleted }, "respuestas de formularios borradas por anonimización");
});
