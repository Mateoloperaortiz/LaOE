import { z } from "zod";
import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { registerHandler } from "@/jobs/registry";
import { findTermByCode, getCurrentTerm } from "@/modules/terms";
import { applyDecisions } from "./domain/closing";
import { addMembersAs } from "./domain/groups";
import { recomputeSnapshots } from "./domain/snapshots";

// Handlers del outbox de permanencia (ADR-012, ADR-036 regla 5): el recompute corre fuera del
// request con clave por término o por persona; los eventos de otros módulos solo lo encolan.

const recomputeEvent = z.object({
  termId: z.string().min(1),
  personId: z.string().min(1).optional(),
});

export async function enqueueRecompute(termId: string, personId: string | null = null) {
  await enqueueEvent(getDb(), {
    type: "permanence.recompute",
    payload: personId ? { termId, personId } : { termId },
    dedupeKey: `permanence:${termId}:${personId ?? "*"}`,
  });
}

registerHandler("permanence.recompute", async (payload, ctx) => {
  const { termId, personId } = recomputeEvent.parse(payload);
  const rows = await recomputeSnapshots(termId, personId ?? null);
  ctx.log.info({ termId, personId: personId ?? null, rows }, "permanencia recalculada");
});

// Check-ins aprobados o anulados: la persona en el término de la ocasión.
const checkInEvent = z.object({ personId: z.string().min(1), termId: z.string().min(1) });
for (const type of ["checkin.approved", "checkin.cancelled"]) {
  registerHandler(type, async (payload) => {
    const { personId, termId } = checkInEvent.parse(payload);
    await enqueueRecompute(termId, personId);
  });
}

// Cambio de comités en un término.
const committeeEvent = z.object({ personId: z.string().min(1), termId: z.string().min(1) });
registerHandler("committee-membership.changed", async (payload) => {
  const { personId, termId } = committeeEvent.parse(payload);
  await enqueueRecompute(termId, personId);
});

// Cambio de estado de la membresía: el término actual.
const personEvent = z.object({ personId: z.string().min(1) });
registerHandler("membership.changed", async (payload) => {
  const { personId } = personEvent.parse(payload);
  const term = await getCurrentTerm();
  if (term) {
    await enqueueRecompute(term.id, personId);
  }
});

// Importación del roster: el término del archivo, una vez por término.
const importedEvent = z.object({ termCode: z.string().min(1) });
registerHandler("person.imported", async (payload) => {
  const { termCode } = importedEvent.parse(payload);
  const term = await findTermByCode(termCode);
  if (term) {
    await enqueueRecompute(term.id);
  }
});

// Una ocasión cerrada o los puntos cerrados cambian "lo que aún es posible" de todos.
const termEvent = z.object({ termId: z.string().min(1) });
for (const type of ["occasion.closed", "term.points-closed"]) {
  registerHandler(type, async (payload) => {
    const { termId } = termEvent.parse(payload);
    await enqueueRecompute(termId);
  });
}

// Programado diario: el término actual, para que lo posible envejezca aunque no pase nada.
registerHandler("permanence.daily", async (_payload, ctx) => {
  const term = await getCurrentTerm();
  if (!term) {
    return;
  }
  const rows = await recomputeSnapshots(term.id);
  ctx.log.info({ termId: term.id, rows }, "permanencia diaria recalculada");
});

// Cierre aplicado (ADR-036 regla 9): el job ejecuta las decisiones confirmadas que falten, con el
// actor que confirmó cada una; si falla a mitad, el reintento retoma por `appliedAt`.
const closedEvent = z.object({ termId: z.string().min(1), nextTermId: z.string().min(1) });
registerHandler("permanence.closed", async (payload, ctx) => {
  const { termId, nextTermId } = closedEvent.parse(payload);
  const applied = await applyDecisions(termId, nextTermId);
  ctx.log.info({ termId, nextTermId, applied }, "decisiones de permanencia aplicadas");
});

// Una inscripción aceptada a una convocatoria interna entra al grupo (ADR-037 regla 10): idempotente
// ("quien ya está, se queda") y solo activos; `addMembers` encola el recompute de la persona.
const callEntryChanged = z.object({
  groupId: z.string().min(1),
  personId: z.string().min(1),
  status: z.string(),
  actorId: z.string().nullable().optional(),
});

registerHandler("call-entry.changed", async (payload, ctx) => {
  const { groupId, personId, status, actorId } = callEntryChanged.parse(payload);
  if (status !== "ACCEPTED") {
    return;
  }
  const added = await addMembersAs({ personId: actorId ?? null }, groupId, [personId]);
  ctx.log.info({ groupId, personId, added }, "inscripción aceptada al grupo");
});
