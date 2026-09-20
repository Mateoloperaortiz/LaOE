import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { callEntryChanged } from "@/domain-events/crm";
import { eventOf } from "@/domain-events/define";
import {
  checkinApproved,
  checkinCancelled,
  checkinExcused,
  occasionClosed,
  termPointsClosed,
} from "@/domain-events/participation";
import {
  committeeMembershipChanged,
  membershipChanged,
  membershipTermChanged,
  personImported,
  sanctionRecorded,
  sanctionRevoked,
} from "@/domain-events/people";
import { permanenceClosed, permanenceRecompute } from "@/domain-events/permanence";
import { onEvent, onEvents, registerHandler } from "@/jobs/registry";
import { findTermByCode, getCurrentTerm } from "@/modules/terms";
import { applyDecisions } from "./domain/closing";
import { addMembersAs } from "./domain/groups";
import { runNotices } from "./domain/notices";
import { recomputeSnapshots } from "./domain/snapshots";

// Handlers del outbox de permanencia (ADR-012, ADR-036 regla 5): el recompute corre fuera del
// request con clave por término o por persona; los eventos de otros módulos solo lo encolan.

export async function enqueueRecompute(termId: string, personId: string | null = null) {
  await enqueueEvent(
    getDb(),
    eventOf(permanenceRecompute, personId ? { termId, personId } : { termId }, {
      dedupeKey: `permanence:${termId}:${personId ?? "*"}`,
    }),
  );
}

onEvent(permanenceRecompute, async ({ termId, personId }, ctx) => {
  const rows = await recomputeSnapshots(termId, personId ?? null);
  ctx.log.info({ termId, personId: personId ?? null, rows }, "permanencia recalculada");
});

// Check-ins aprobados o anulados: la persona en el término de la ocasión.
onEvents([checkinApproved, checkinCancelled, checkinExcused], async ({ personId, termId }) => {
  await enqueueRecompute(termId, personId);
});

// Cambio de comités en un término.
onEvent(committeeMembershipChanged, async ({ personId, termId }) => {
  await enqueueRecompute(termId, personId);
});

// Condición de prueba fijada por el cierre o por ADMIN desde la Persona 360 (ADR-056): la persona en
// ese término, para que el umbral nuevo se vea sin esperar al programado diario.
onEvent(membershipTermChanged, async ({ personId, termId }) => {
  await enqueueRecompute(termId, personId);
});

// Sanciones registradas o revocadas (ADR-060 regla 6): la persona en el término de la sanción.
onEvents([sanctionRecorded, sanctionRevoked], async ({ personId, termId }) => {
  await enqueueRecompute(termId, personId);
});

// Cambio de estado de la membresía: el término actual.
onEvent(membershipChanged, async ({ personId }) => {
  const term = await getCurrentTerm();
  if (term) {
    await enqueueRecompute(term.id, personId);
  }
});

// Importación del roster: el término del archivo, una vez por término.
onEvent(personImported, async ({ termCode }) => {
  const term = await findTermByCode(termCode);
  if (term) {
    await enqueueRecompute(term.id);
  }
});

// Una ocasión cerrada o los puntos cerrados cambian "lo que aún es posible" de todos.
onEvents([occasionClosed, termPointsClosed], async ({ termId }) => {
  await enqueueRecompute(termId);
});

// Programado diario: el término actual, para que lo posible envejezca aunque no pase nada.
registerHandler("permanence.daily", async (_payload, ctx) => {
  const term = await getCurrentTerm();
  if (!term) {
    return;
  }
  const rows = await recomputeSnapshots(term.id);
  ctx.log.info({ termId: term.id, rows }, "permanencia diaria recalculada");
});

// Avisos por push (ADR-038 regla 10): programado `notices` a las 09:00, una vez por persona y aviso.
registerHandler("permanence.notices", async (payload, ctx) => {
  const at = typeof payload.at === "string" ? new Date(payload.at) : new Date();
  const result = await runNotices(Number.isNaN(at.getTime()) ? new Date() : at);
  ctx.log.info(result, "avisos de permanencia encolados");
});

// Cierre aplicado (ADR-036 regla 9): el job ejecuta las decisiones confirmadas que falten, con el
// actor que confirmó cada una; si falla a mitad, el reintento retoma por `appliedAt`.
onEvent(permanenceClosed, async ({ termId, nextTermId }, ctx) => {
  const applied = await applyDecisions(termId, nextTermId);
  ctx.log.info({ termId, nextTermId, applied }, "decisiones de permanencia aplicadas");
});

// Una inscripción aceptada a una convocatoria interna entra al grupo (ADR-037 regla 10): idempotente
// ("quien ya está, se queda") y solo activos; `addMembers` encola el recompute de la persona.
onEvent(callEntryChanged, async ({ groupId, personId, status, actorId }, ctx) => {
  if (status !== "ACCEPTED") {
    return;
  }
  const added = await addMembersAs({ personId: actorId }, groupId, [personId]);
  ctx.log.info({ groupId, personId, added }, "inscripción aceptada al grupo");
});
