import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `participation`. Los campos de tipo enumerado (categoría, clase de ocasión, origen
// del check-in) viajan como texto: un valor nuevo en la base no debe dejar eventos en dead letter.

const id = z.string().min(1);

/** Lo que el check-in cuenta de sí mismo: autosuficiente, para que quien escucha no consulte a participation. */
const checkInFacts = z.object({
  occasionId: id,
  occasionTitle: z.string(),
  personId: id,
  termId: id,
  category: z.string(),
  kind: z.string(),
  points: z.number().int(),
  source: z.string(),
});

/** Anular o excusar lleva su motivo, que puede no haberse escrito. */
const checkInDecision = checkInFacts.extend({ reason: z.string().nullable() });

export const checkinApproved = defineEvent("checkin.approved", checkInFacts);
export const checkinPending = defineEvent("checkin.pending", checkInFacts);
export const checkinCancelled = defineEvent("checkin.cancelled", checkInDecision);
export const checkinExcused = defineEvent("checkin.excused", checkInDecision);

/** Recalcula el score de comité de una ocasión; se emite con `dedupeKey` por ocasión. */
export const scoreRecompute = defineEvent("score.recompute", z.object({ occasionId: id }));
