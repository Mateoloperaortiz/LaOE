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

// Ocasiones y cierre de puntos.

/** Una ocasión cerrada: quien escucha recalcula lo que dependía de que siguiera abierta. */
export const occasionClosed = defineEvent(
  "occasion.closed",
  z.object({ occasionId: id, termId: id, points: z.number().int() }),
);

/** Se cerraron los puntos del término. */
export const termPointsClosed = defineEvent("term.points-closed", z.object({ termId: id }));

/** Se acerca el fin del término y el siguiente no existe; se emite una vez por código faltante. */
export const termSuccessorMissing = defineEvent(
  "term.successor-missing",
  z.object({ termId: id, code: z.string(), next: z.string().min(1), endsOn: z.string().min(1) }),
);

// Libro de puntos.

const ledgerMovement = z.object({
  personId: id,
  termId: id,
  points: z.number().int(),
  reason: z.string(),
});

export const pointsAdjusted = defineEvent("points.adjusted", ledgerMovement);
export const pointsReversed = defineEvent("points.reversed", ledgerMovement);

// Retos (ADR-067).

export const challengePublished = defineEvent(
  "challenge.published",
  z.object({
    challengeId: id,
    termId: id,
    title: z.string().min(1),
    kind: z.string(),
    closesAt: z.string().min(1),
    audience: z.string(),
    audienceCommitteeIds: z.array(z.string()),
    basePoints: z.number().int(),
  }),
);

const challengeDecision = z.object({
  participationId: id,
  challengeId: id,
  challengeTitle: z.string().min(1),
  personId: id,
  termId: id,
});

export const challengeCompleted = defineEvent(
  "challenge.completed",
  challengeDecision.extend({
    kind: z.string(),
    base: z.number().int(),
    extra: z.number().int(),
    points: z.number().int(),
  }),
);

export const challengeRejected = defineEvent(
  "challenge.rejected",
  challengeDecision.extend({ reason: z.string() }),
);

/** Se devolvió un premio: el de una entrega de reto o el de un check-in, según cuál venga lleno. */
export const challengeRewardReversed = defineEvent(
  "challenge.reward-reversed",
  z.object({
    personId: id,
    termId: id,
    rewardId: id,
    participationId: id.nullable(),
    checkInId: id.nullable(),
  }),
);

// Insignias y boosters.

export const badgeUnlocked = defineEvent(
  "badge.unlocked",
  z.object({
    achievementId: id,
    personId: id,
    badgeId: id,
    code: z.string(),
    family: z.string(),
    level: z.number().int(),
    name: z.string().min(1),
    /** El término de la definición o el de la ocasión o el reto de origen; puede no haber ninguno. */
    termId: id.nullable(),
    historical: z.boolean(),
    /** El booster que trae el logro, si trae alguno. */
    boosterKind: z.string().nullable(),
  }),
);

export const boosterGranted = defineEvent(
  "booster.granted",
  z.object({ boosterId: id, personId: id, termId: id, kind: z.string(), source: z.string() }),
);

// Juegos.

export const wordleCompleted = defineEvent(
  "wordle.completed",
  z.object({
    personId: id,
    termId: id,
    gameId: id,
    day: z.string(),
    attempts: z.number().int(),
    points: z.number().int(),
  }),
);

export const game2048Completed = defineEvent(
  "game2048.completed",
  z.object({
    personId: id,
    termId: id,
    runId: id,
    day: z.string(),
    score: z.number().int(),
    maxTile: z.number().int(),
    points: z.number().int(),
  }),
);

export const sudokuCompleted = defineEvent(
  "sudoku.completed",
  z.object({
    personId: id,
    termId: id,
    runId: id,
    day: z.string(),
    difficulty: z.string(),
    assisted: z.boolean(),
    points: z.number().int(),
  }),
);

export const panalCompleted = defineEvent(
  "panal.completed",
  z.object({
    personId: id,
    termId: id,
    gameId: id,
    day: z.string(),
    score: z.number().int(),
    points: z.number().int(),
  }),
);

export const panalCheckpointReached = defineEvent(
  "panal.checkpoint-reached",
  z.object({
    personId: id,
    termId: id,
    gameId: id,
    day: z.string(),
    checkpoint: z.number().int().min(1).max(2),
    words: z.number().int(),
    points: z.number().int(),
  }),
);

// Trabajo interno de la gamificación: lo emite y lo atiende participation.

/** Procesa el archivo de una evidencia; se emite con `dedupeKey` por archivo. */
export const evidenceProcess = defineEvent(
  "gamification.evidence-process",
  z.object({ fileId: id }),
);

/** Un lote de la conciliación histórica; `batch` es informativo, el cursor lo lleva la corrida. */
export const gamificationReconcile = defineEvent(
  "gamification.reconcile",
  z.object({ runId: id, batch: z.number().int().nonnegative() }),
);

/** Conciliación periódica de bonos, licencias y excusas aprobadas fuera de un check-in. */
export const presenceStreakReconcile = defineEvent(
  "participation.presence-streak-reconcile",
  z.object({ at: z.string().optional() }),
);

export const gamerStreakReminder = defineEvent(
  "participation.gamer-streak-reminder",
  z.object({ at: z.string().optional() }),
);
