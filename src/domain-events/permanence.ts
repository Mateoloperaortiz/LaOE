import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `permanence`. Los campos de tipo enumerado (clase de grupo, evaluación, decisión)
// viajan como texto: un valor nuevo en la base no debe dejar eventos en dead letter.

const id = z.string().min(1);

/** Quien hizo el cambio; `null` cuando lo hace el sistema (el cierre aplicado por el job, una importación). */
const actorId = z.string().nullable();

/**
 * Recalcula la permanencia de un término, o de una sola persona si viene. Es trabajo interno: lo encola
 * y lo atiende permanence, con `dedupeKey` por término y persona.
 */
export const permanenceRecompute = defineEvent(
  "permanence.recompute",
  z.object({ termId: id, personId: id.optional() }),
);

/** El cierre quedó confirmado: el job aplica las decisiones que falten. */
export const permanenceClosed = defineEvent(
  "permanence.closed",
  z.object({ termId: id, nextTermId: id, actorId }),
);

/** La decisión de una persona en el cierre, por comité o para toda la OE. */
export const permanenceDecided = defineEvent(
  "permanence.decided",
  z.object({
    actorId,
    personId: id,
    termId: id,
    /** `null` en la fila por persona, que decide continuar o salir de la OE; con valor, la de un comité. */
    committeeId: id.nullable(),
    decision: z.string(),
    reason: z.string(),
  }),
);

export const evaluationRecorded = defineEvent(
  "evaluation.recorded",
  z.object({
    actorId,
    personId: id,
    termId: id,
    groupId: id,
    groupName: z.string(),
    kind: z.string(),
    evaluation: z.string(),
    note: z.string(),
    /** La importación histórica no sabe quién evaluó. */
    evaluatorName: z.string().optional(),
  }),
);

const scored = z.object({
  actorId,
  personId: id,
  termId: id,
  ruleId: id,
  criterion: z.string(),
  value: z.number(),
  weight: z.number(),
});

export const leaderScoreRecorded = defineEvent(
  "leader-score.recorded",
  // Una regla de alcance OE no tiene comité.
  scored.extend({ committeeId: id.nullable(), note: z.string() }),
);

export const manualCreditGranted = defineEvent(
  "manual-credit.granted",
  scored.extend({ reason: z.string() }),
);

export const workGroupMembershipChanged = defineEvent(
  "work-group-membership.changed",
  z.object({
    actorId,
    personId: id,
    termId: id,
    groupId: id,
    groupName: z.string(),
    kind: z.string(),
    change: z.string(),
  }),
);
