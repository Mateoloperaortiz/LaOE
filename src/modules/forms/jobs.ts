import { z } from "zod";
import { registerHandler } from "@/jobs/registry";
import { deleteSubmissionsFor } from "./domain/submissions";

// Al salir de la OE o anonimizarse se borran las respuestas de formularios (ADR-030, ADR-037 regla 4).

const personEvent = z.object({ personId: z.string().min(1) });
const membershipChanged = personEvent.extend({ to: z.string() });

registerHandler("membership.changed", async (payload, ctx) => {
  const { personId, to } = membershipChanged.parse(payload);
  if (to !== "INACTIVE") {
    return;
  }
  const deleted = await deleteSubmissionsFor(personId);
  ctx.log.info({ personId, deleted }, "respuestas de formularios borradas al salir");
});

registerHandler("person.anonymized", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  const deleted = await deleteSubmissionsFor(personId);
  ctx.log.info({ personId, deleted }, "respuestas de formularios borradas por anonimización");
});
