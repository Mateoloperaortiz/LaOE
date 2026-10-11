import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import {
  challengeCompleted,
  challengeRejected,
  evidenceProcess,
} from "@/domain-events/participation";
import { lockOpenTermPoints } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import type {
  BoosterKind,
  CampaignPercent,
  ParticipationStatus,
  RewardBreakdown,
  SubmitDenial,
} from "../gamification-types";
import {
  challenge,
  challengeEvidenceFile,
  challengeParticipation,
  challengeParticipationStatus,
  challengeQuestion,
  type checkIn,
  reward,
} from "../schema";
import {
  type AdminParticipantRow,
  activeCampaignFor,
  type ChallengeRow,
  findTargetedBooster,
  listParticipantRows,
  type ParticipationRow,
} from "./challenges";
import { audienceIncludes, boosterPercent, challengeState, gradeTrivia } from "./gamification-pure";
import type { GamificationSettings, MemberContext } from "./member-context";
import { resolveMemberContext } from "./member-context";
import type { OccasionRow } from "./occasions";
import {
  grantReward,
  type ReserveRewardInput,
  type RewardRow,
  releaseReward,
  rereserveReward,
  reserveAndGrantReward,
  reserveReward,
  reverseReward,
} from "./rewards";

// Participaciones en retos (ADR-067 reglas 3, 12 y 15): la trivia se califica y premia en el
// momento; la evidencia queda pendiente con el premio reservado hasta la revisión de GH; el reto
// presencial sigue el ciclo del check-in de su ocasión. `requestId` absorbe los reintentos.

export type { ParticipationRow } from "./challenges";

// Tipo local (no importar de ./check-ins: sería un ciclo, check-ins llama a applyPresentialCheckIn).
type CheckInRow = typeof checkIn.$inferSelect;

export type { SubmitDenial };

export type SubmitResult =
  | {
      ok: true;
      participation: ParticipationRow;
      reward: RewardRow | null;
      breakdown: RewardBreakdown | null;
    }
  | { ok: false; reason: SubmitDenial };

/** Lo que el wrapper resuelve antes de la transacción: contexto del miembro, bandera y premios. */
export interface SubmitContext {
  member: MemberContext | null;
  settings: GamificationSettings;
  booster: { id: string; kind: BoosterKind } | null;
  campaign: { id: string; percent: CampaignPercent } | null;
}

/**
 * Señal para el wrapper: el unique (reto, persona) decidió el duplicado. El de (reto, requestId) ya no
 * cruza personas, porque el `requestId` se guarda con la suya (ADR-118 regla 18).
 */
export class ChallengeAlreadySubmitted extends Error {
  constructor() {
    super("participación repetida");
    this.name = "ChallengeAlreadySubmitted";
  }
}

async function lockTerm(ctx: CommandContext, termId: string): Promise<boolean> {
  try {
    await lockOpenTermPoints(ctx.tx, termId);
    return true;
  } catch (error) {
    if (error instanceof DomainError && error.message === t("T-629")) {
      return false;
    }
    throw error;
  }
}

// FOR SHARE en el camino del miembro (ADR-035): las entregas no se serializan entre sí; una
// mutación admin (FOR UPDATE en challenges.ts) sí espera a las lecturas en curso.
async function challengeForShare(ctx: CommandContext, id: string): Promise<ChallengeRow | null> {
  const [row] = await ctx.tx
    .select()
    .from(challenge)
    .where(eq(challenge.id, id))
    .for("share")
    .limit(1);
  return row ?? null;
}

async function existingParticipation(
  ctx: CommandContext,
  challengeId: string,
  personId: string,
): Promise<ParticipationRow | null> {
  const [row] = await ctx.tx
    .select()
    .from(challengeParticipation)
    .where(
      and(
        eq(challengeParticipation.challengeId, challengeId),
        eq(challengeParticipation.personId, personId),
      ),
    )
    .for("update")
    .limit(1);
  return row ?? null;
}

async function rewardOf(ctx: CommandContext, rewardId: string | null): Promise<RewardRow | null> {
  if (!rewardId) {
    return null;
  }
  const [row] = await ctx.tx.select().from(reward).where(eq(reward.id, rewardId)).limit(1);
  return row ?? null;
}

/** Breakdown reconstruido del premio guardado, para el replay idempotente. */
function breakdownOf(row: RewardRow): RewardBreakdown {
  const extraRequested = Math.floor(
    (row.basePoints * Math.min(row.personalPercent + row.campaignPercent, 100)) / 100,
  );
  return {
    base: row.basePoints,
    personalPercent: row.personalPercent as RewardBreakdown["personalPercent"],
    campaignPercent: row.campaignPercent as RewardBreakdown["campaignPercent"],
    extraRequested,
    baseGranted: row.baseGranted,
    extraGranted: row.extraPoints,
    personalConsumed: row.boosterItemId !== null,
    capped: row.baseGranted < row.basePoints || row.extraPoints < extraRequested,
  };
}

function rewardReasons(row: ChallengeRow, percent: number): { base: string; extra: string } {
  return {
    base: t("T-2469", { reto: row.title }),
    extra: t("T-2470", { porcentaje: Math.min(percent, 100), origen: row.title }),
  };
}

/** Porcentaje del motivo: el pedido al reservar o el snapshot guardado al confirmar después. */
function contextPercent(context: SubmitContext): number {
  return (
    (context.booster ? boosterPercent(context.booster.kind) : 0) + (context.campaign?.percent ?? 0)
  );
}

function rewardInput(
  row: ChallengeRow,
  personId: string,
  context: SubmitContext,
  extra: { participationId?: string; now?: Date },
): ReserveRewardInput {
  return {
    personId,
    termId: row.termId,
    source: "CHALLENGE",
    participationId: extra.participationId ?? null,
    checkInId: null,
    base: row.basePoints,
    boosterItemId: context.booster?.id ?? null,
    expectedTarget: { challengeId: row.id },
    personalPercent: context.booster ? boosterPercent(context.booster.kind) : 0,
    campaignId: context.campaign?.id ?? null,
    campaignPercent: context.campaign?.percent ?? 0,
    now: extra.now,
  };
}

async function emitCompleted(
  ctx: CommandContext,
  row: ChallengeRow,
  participation: ParticipationRow,
  granted: RewardRow,
): Promise<void> {
  await ctx.emit(
    eventOf(challengeCompleted, {
      participationId: participation.id,
      challengeId: row.id,
      challengeTitle: row.title,
      kind: row.kind,
      personId: participation.personId,
      termId: row.termId,
      base: granted.baseGranted,
      extra: granted.extraPoints,
      points: granted.baseGranted + granted.extraPoints,
    }),
  );
}

async function emitRejected(
  ctx: CommandContext,
  row: ChallengeRow,
  participation: ParticipationRow,
  reason: string,
): Promise<void> {
  await ctx.emit(
    eventOf(challengeRejected, {
      participationId: participation.id,
      challengeId: row.id,
      challengeTitle: row.title,
      personId: participation.personId,
      termId: row.termId,
      reason,
    }),
  );
}

/** Guardas comunes a las entregas del miembro, en el orden del flujo. */
async function submissionGate(
  ctx: CommandContext,
  input: { challengeId: string; personId: string; requestId: string; now?: Date | undefined },
  context: SubmitContext,
): Promise<{ ok: true; row: ChallengeRow; now: Date } | { ok: false; reason: SubmitDenial }> {
  if (!context.settings.enabled) {
    return { ok: false, reason: "DISABLED" };
  }
  const row = await challengeForShare(ctx, input.challengeId);
  if (!row || row.status !== "PUBLISHED") {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (!(await lockTerm(ctx, row.termId))) {
    return { ok: false, reason: "TERM_CLOSED" };
  }
  const now = input.now ?? new Date();
  if (challengeState(row, now) !== "OPEN") {
    return { ok: false, reason: "NOT_OPEN" };
  }
  if (!audienceIncludes(row, context.member)) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }
  return { ok: true, row, now };
}

/** Replay por requestId: devuelve lo que quedó guardado, sin tocar nada. */
async function replayResult(
  ctx: CommandContext,
  participation: ParticipationRow,
): Promise<SubmitResult> {
  const rewardRow = await rewardOf(ctx, participation.rewardId);
  return {
    ok: true,
    participation,
    reward: rewardRow,
    breakdown: rewardRow ? breakdownOf(rewardRow) : null,
  };
}

/**
 * El identificador de una entrega lleva a la persona (ADR-118 regla 18). El `requestId` lo elige el
 * navegador y lo guarda por pestaña, no por sesión, y el índice único es (reto, requestId): guardado
 * tal como llega, el de una persona le cerraba el reto a la siguiente en la misma pestaña.
 */
function submissionRequestId(personId: string, requestId: string): string {
  return `${personId}:${requestId}`;
}

/** El replay compara el contenido guardado, incluso tras cerrar el reto o procesar sus imágenes. */
export async function replaySubmission(
  ctx: CommandContext,
  input: {
    challengeId: string;
    personId: string;
    requestId: string;
    answers?: number[];
    text?: string;
    keys?: string[];
  },
): Promise<SubmitResult | null> {
  const existing = await existingParticipation(ctx, input.challengeId, input.personId);
  if (!existing) return null;
  // Las entregas anteriores a la regla 18 guardaron el `requestId` tal como llegó.
  const sameRequest =
    existing.requestId === submissionRequestId(input.personId, input.requestId) ||
    existing.requestId === input.requestId;
  if (!sameRequest) return { ok: false, reason: "ALREADY" };
  let matches = false;
  if (input.answers) {
    matches = JSON.stringify(existing.answers) === JSON.stringify(input.answers);
  } else if (input.text !== undefined) {
    const files = await ctx.tx
      .select({ key: challengeEvidenceFile.objectKey })
      .from(challengeEvidenceFile)
      .where(eq(challengeEvidenceFile.participationId, existing.id))
      .orderBy(asc(challengeEvidenceFile.ordinal));
    matches =
      existing.evidenceText === input.text.trim() &&
      JSON.stringify(files.map((file) => file.key)) ===
        JSON.stringify([...new Set(input.keys ?? [])]);
  }
  // Con otro contenido se rechaza (ADR-067 regla 6) diciendo que es eso, no que el envío vino mal
  // armado: la pantalla pide recargar, no volver a responder (ADR-122 regla 16).
  return matches ? replayResult(ctx, existing) : { ok: false, reason: "REQUEST_CONFLICT" };
}

async function lockSubmission(
  ctx: CommandContext,
  challengeId: string,
  personId: string,
): Promise<void> {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`submission:${challengeId}:${personId}`}, 0))`,
  );
}

export async function submitTrivia(
  ctx: CommandContext,
  input: {
    challengeId: string;
    personId: string;
    requestId: string;
    answers: number[];
    now?: Date | undefined;
  },
  context: SubmitContext,
): Promise<SubmitResult> {
  await lockSubmission(ctx, input.challengeId, input.personId);
  const replay = await replaySubmission(ctx, input);
  if (replay) return replay;
  const gate = await submissionGate(ctx, input, context);
  if (!gate.ok) {
    return gate;
  }
  const { row, now } = gate;
  if (row.kind !== "TRIVIA") {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  const questions = await ctx.tx
    .select()
    .from(challengeQuestion)
    .where(eq(challengeQuestion.challengeId, row.id))
    .orderBy(asc(challengeQuestion.ordinal));
  const valid =
    input.answers.length === questions.length &&
    questions.every(
      (question, index) =>
        Number.isInteger(input.answers[index]) &&
        (input.answers[index] ?? -1) >= 0 &&
        (input.answers[index] ?? -1) < question.options.length,
    );
  if (!valid) {
    return { ok: false, reason: "INCOMPLETE" };
  }
  const passPercent = row.passPercent ?? 100;
  const { score, total, passed } = gradeTrivia(
    input.answers,
    questions.map((question) => question.correctIndex),
    passPercent,
  );
  let created: ParticipationRow | undefined;
  try {
    [created] = await ctx.tx
      .insert(challengeParticipation)
      .values({
        challengeId: row.id,
        personId: input.personId,
        requestId: submissionRequestId(input.personId, input.requestId),
        status: passed ? "COMPLETED" : "REJECTED",
        submittedAt: now,
        answers: input.answers,
        score,
        passed,
        reason: passed ? null : t("T-2423", { porcentaje: passPercent, aciertos: score, total }),
        decidedAt: now,
        decidedById: ctx.actor.personId,
      })
      .returning();
  } catch (error) {
    if (
      isUniqueViolation(error, "challenge_participation_unique") ||
      isUniqueViolation(error, "challenge_participation_request_unique")
    ) {
      // La transacción quedó abortada: el wrapper lee la fila y devuelve ALREADY.
      throw new ChallengeAlreadySubmitted();
    }
    throw error;
  }
  if (!created) {
    throw new Error("No se pudo guardar la entrega");
  }
  await ctx.audit({
    action: "challenge.submitted",
    entityType: "challenge_participation",
    entityId: created.id,
    after: {
      challengeId: row.id,
      personId: input.personId,
      kind: row.kind,
      score,
      total,
      passed,
    },
  });
  if (!passed) {
    const reason = created.reason ?? "";
    await emitRejected(ctx, row, created, reason);
    return { ok: true, participation: created, reward: null, breakdown: null };
  }
  const { reward: granted, breakdown } = await reserveAndGrantReward(
    ctx,
    rewardInput(row, input.personId, context, { participationId: created.id, now }),
    context.settings.caps,
    rewardReasons(row, contextPercent(context)),
  );
  const [updated] = await ctx.tx
    .update(challengeParticipation)
    .set({ rewardId: granted.id, updatedAt: now })
    .where(eq(challengeParticipation.id, created.id))
    .returning();
  const participation = updated ?? { ...created, rewardId: granted.id };
  await emitCompleted(ctx, row, participation, granted);
  return { ok: true, participation, reward: granted, breakdown };
}

export const EVIDENCE_TEXT_MIN = 20;
export const EVIDENCE_TEXT_MAX = 1000;

export async function submitEvidence(
  ctx: CommandContext,
  input: {
    challengeId: string;
    personId: string;
    requestId: string;
    text: string;
    /** Objetos ya verificados por el wrapper (HEAD del bucket). */
    files: Array<{ key: string; contentType: string; byteSize: number }>;
    now?: Date | undefined;
  },
  context: SubmitContext,
): Promise<SubmitResult> {
  await lockSubmission(ctx, input.challengeId, input.personId);
  const replay = await replaySubmission(ctx, {
    ...input,
    keys: input.files.map((file) => file.key),
  });
  if (replay) return replay;
  const gate = await submissionGate(ctx, input, context);
  if (!gate.ok) {
    return gate;
  }
  const { row, now } = gate;
  if (row.kind !== "EVIDENCE") {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  const text = input.text.trim();
  if (
    text.length < EVIDENCE_TEXT_MIN ||
    text.length > EVIDENCE_TEXT_MAX ||
    input.files.length > 3
  ) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  let created: ParticipationRow | undefined;
  try {
    [created] = await ctx.tx
      .insert(challengeParticipation)
      .values({
        challengeId: row.id,
        personId: input.personId,
        requestId: submissionRequestId(input.personId, input.requestId),
        status: "PENDING",
        submittedAt: now,
        evidenceText: text,
      })
      .returning();
  } catch (error) {
    if (
      isUniqueViolation(error, "challenge_participation_unique") ||
      isUniqueViolation(error, "challenge_participation_request_unique")
    ) {
      throw new ChallengeAlreadySubmitted();
    }
    throw error;
  }
  if (!created) {
    throw new Error("No se pudo guardar la entrega");
  }
  if (input.files.length > 0) {
    const files = await ctx.tx
      .insert(challengeEvidenceFile)
      .values(
        input.files.map((file, index) => ({
          participationId: created.id,
          ordinal: index + 1,
          objectKey: file.key,
          contentType: file.contentType,
          byteSize: file.byteSize,
        })),
      )
      .returning({ id: challengeEvidenceFile.id });
    for (const file of files) {
      await ctx.emit(
        eventOf(evidenceProcess, { fileId: file.id }, { dedupeKey: `evidence:${file.id}` }),
      );
    }
  }
  const { reward: reserved, breakdown } = await reserveReward(
    ctx,
    rewardInput(row, input.personId, context, { participationId: created.id, now }),
    context.settings.caps,
  );
  const [updated] = await ctx.tx
    .update(challengeParticipation)
    .set({ rewardId: reserved.id, updatedAt: now })
    .where(eq(challengeParticipation.id, created.id))
    .returning();
  const participation = updated ?? { ...created, rewardId: reserved.id };
  await ctx.audit({
    action: "challenge.submitted",
    entityType: "challenge_participation",
    entityId: created.id,
    after: {
      challengeId: row.id,
      personId: input.personId,
      kind: row.kind,
      files: input.files.length,
    },
  });
  return { ok: true, participation, reward: reserved, breakdown };
}

/**
 * Gancho del check-in (ADR-067 regla 12): la ocasión vinculada a un reto presencial abierto al
 * momento del registro completa, reserva o anula la participación según el desenlace del check-in.
 * Las reservas previas se deciden aunque cambien la bandera, el reto o la membresía.
 */
export async function applyPresentialCheckIn(
  ctx: CommandContext,
  input: {
    checkIn: CheckInRow;
    occasion: OccasionRow;
    outcome: "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED";
    reason?: string | null;
    /**
     * Motivo con el que se cierra la entrega pendiente en un rechazo. Sin él vale el automático de
     * una asistencia no aprobada (T-2579); la excusa trae el suyo (T-3205, ADR-111 regla 3).
     */
    rejectionReason?: string | undefined;
    now?: Date | undefined;
  },
  context: { settings: GamificationSettings },
): Promise<void> {
  const now = input.now ?? new Date();
  const rows = await ctx.tx
    .select()
    .from(challenge)
    .where(and(eq(challenge.occasionId, input.occasion.id), eq(challenge.kind, "PRESENTIAL")))
    .for("share");
  for (const row of rows) {
    const existing = await existingParticipation(ctx, row.id, input.checkIn.personId);
    const correcting = input.outcome === "REJECTED" || input.outcome === "CANCELLED";
    const confirming = input.outcome === "APPROVED" && existing?.status === "PENDING";
    if (correcting && !existing) continue;
    if (!correcting && !confirming) {
      if (existing?.status === "COMPLETED" || existing?.status === "ANNULLED") continue;
      // Una reserva nueva requiere activación y un reto publicado cuya ventana incluya el registro.
      if (!context.settings.enabled || challengeState(row, input.checkIn.at) !== "OPEN") continue;
      if (!existing) {
        const member = await resolveMemberContext(input.checkIn.personId, row.termId, ctx.tx);
        if (!audienceIncludes(row, member)) continue;
      }
    }
    // Solo lo apuntado al reto: un booster o campaña sobre la ocasión potencia el premio de la
    // asistencia (reward CHECKIN, G-T4), no el del reto.
    const subContext: SubmitContext = {
      member: null,
      settings: context.settings,
      booster:
        correcting || confirming
          ? null
          : await findTargetedBooster(ctx.tx, input.checkIn.personId, { challengeId: row.id }, now),
      campaign:
        correcting || confirming
          ? null
          : await activeCampaignFor(ctx.tx, { challengeId: row.id }, now),
    };
    if (input.outcome === "APPROVED") {
      if (existing?.status === "COMPLETED") {
        continue;
      }
      if (existing?.status === "PENDING") {
        if (existing.rewardId) {
          const reserved = await rewardOf(ctx, existing.rewardId);
          const granted = await grantReward(
            ctx,
            existing.rewardId,
            rewardReasons(row, reserved ? reserved.personalPercent + reserved.campaignPercent : 0),
            now,
          );
          await ctx.tx
            .update(challengeParticipation)
            .set({
              status: "COMPLETED",
              checkInId: input.checkIn.id,
              decidedAt: now,
              decidedById: ctx.actor.personId,
              updatedAt: now,
            })
            .where(eq(challengeParticipation.id, existing.id));
          await auditParticipation(ctx, row, existing, "COMPLETED");
          await emitCompleted(ctx, row, existing, granted);
        }
        continue;
      }
      const [created] = existing
        ? [existing]
        : await ctx.tx
            .insert(challengeParticipation)
            .values({
              challengeId: row.id,
              personId: input.checkIn.personId,
              requestId: `checkin:${input.checkIn.id}`,
              status: "COMPLETED",
              submittedAt: now,
              checkInId: input.checkIn.id,
              decidedAt: now,
              decidedById: ctx.actor.personId,
            })
            .returning();
      if (!created) {
        throw new Error("No se pudo registrar la participación");
      }
      const reserveInput = rewardInput(row, input.checkIn.personId, subContext, {
        participationId: created.id,
        now,
      });
      const reasons = rewardReasons(row, contextPercent(subContext));
      let granted: RewardRow;
      if (existing?.rewardId) {
        await rereserveReward(ctx, existing.rewardId, reserveInput, context.settings.caps, now);
        granted = await grantReward(ctx, existing.rewardId, reasons, now);
      } else {
        granted = (await reserveAndGrantReward(ctx, reserveInput, context.settings.caps, reasons))
          .reward;
      }
      const [updated] = await ctx.tx
        .update(challengeParticipation)
        .set({
          rewardId: granted.id,
          status: "COMPLETED",
          reason: null,
          decidedAt: now,
          decidedById: ctx.actor.personId,
          updatedAt: now,
        })
        .where(eq(challengeParticipation.id, created.id))
        .returning();
      await auditParticipation(ctx, row, updated ?? created, "COMPLETED");
      await emitCompleted(ctx, row, updated ?? created, granted);
      continue;
    }
    if (input.outcome === "PENDING") {
      if (existing) {
        continue;
      }
      const [created] = await ctx.tx
        .insert(challengeParticipation)
        .values({
          challengeId: row.id,
          personId: input.checkIn.personId,
          requestId: `checkin:${input.checkIn.id}`,
          status: "PENDING",
          submittedAt: now,
          checkInId: input.checkIn.id,
        })
        .returning();
      if (!created) {
        throw new Error("No se pudo registrar la participación");
      }
      const { reward: reserved } = await reserveReward(
        ctx,
        rewardInput(row, input.checkIn.personId, subContext, {
          participationId: created.id,
          now,
        }),
        context.settings.caps,
      );
      await ctx.tx
        .update(challengeParticipation)
        .set({ rewardId: reserved.id, updatedAt: now })
        .where(eq(challengeParticipation.id, created.id));
      await auditParticipation(ctx, row, created, "PENDING");
      continue;
    }
    if (input.outcome === "REJECTED") {
      if (existing?.status !== "PENDING") {
        continue;
      }
      const reason = input.rejectionReason ?? t("T-2579", { actividad: input.occasion.title });
      if (existing.rewardId) {
        await releaseReward(ctx, existing.rewardId, reason);
      }
      await ctx.tx
        .update(challengeParticipation)
        .set({
          status: "REJECTED",
          reason,
          decidedAt: now,
          decidedById: ctx.actor.personId,
          updatedAt: now,
        })
        .where(eq(challengeParticipation.id, existing.id));
      await auditParticipation(ctx, row, existing, "REJECTED");
      await emitRejected(ctx, row, existing, reason);
      continue;
    }
    // CANCELLED: la aprobada se anula con reversión; la pendiente se libera y rechaza.
    const reason = t("T-2580", {
      actividad: input.occasion.title,
      motivo: input.reason ?? "",
    });
    if (existing?.status === "COMPLETED") {
      if (existing.rewardId) {
        await reverseReward(ctx, existing.rewardId, reason, now);
      }
      await ctx.tx
        .update(challengeParticipation)
        .set({
          status: "ANNULLED",
          reason,
          decidedAt: now,
          decidedById: ctx.actor.personId,
          updatedAt: now,
        })
        .where(eq(challengeParticipation.id, existing.id));
      await auditParticipation(ctx, row, existing, "ANNULLED");
    } else if (existing?.status === "PENDING") {
      if (existing.rewardId) {
        await releaseReward(ctx, existing.rewardId, reason);
      }
      await ctx.tx
        .update(challengeParticipation)
        .set({
          status: "REJECTED",
          reason,
          decidedAt: now,
          decidedById: ctx.actor.personId,
          updatedAt: now,
        })
        .where(eq(challengeParticipation.id, existing.id));
      await auditParticipation(ctx, row, existing, "REJECTED");
      await emitRejected(ctx, row, existing, reason);
    }
  }
}

async function auditParticipation(
  ctx: CommandContext,
  row: ChallengeRow,
  participation: ParticipationRow,
  status: ParticipationStatus,
): Promise<void> {
  await ctx.audit({
    action: `challenge.${status === "COMPLETED" ? "completed" : status === "REJECTED" ? "rejected" : "annulled"}`,
    entityType: "challenge_participation",
    entityId: participation.id,
    before: { status: participation.status },
    after: { status, challengeId: row.id, personId: participation.personId },
  });
}

/**
 * El estado de una entrega con la palabra del catálogo (T-3266, en el orden del enum), como
 * `checkInStatusLabel` con las asistencias: es lo que nombra el error de una decisión que ya no
 * aplica (ADR-123 regla 8).
 */
function participationStatusLabel(status: ParticipationStatus): string {
  return tList("T-3266")[challengeParticipationStatus.enumValues.indexOf(status)] ?? status;
}

/** Revisión de GH sobre una entrega pendiente: aprobar entrega el premio; rechazar lo libera. */
export async function reviewParticipation(
  ctx: CommandContext,
  input: {
    participationId: string;
    decision: "APPROVE" | "REJECT";
    reason?: string | null | undefined;
    now?: Date | undefined;
  },
  _context: { settings: GamificationSettings },
): Promise<void> {
  const now = input.now ?? new Date();
  const [participation] = await ctx.tx
    .select()
    .from(challengeParticipation)
    .where(eq(challengeParticipation.id, input.participationId))
    .for("update")
    .limit(1);
  if (!participation) {
    throw new DomainError(t("T-032"));
  }
  if (participation.status !== "PENDING") {
    throw new DomainError(
      t("T-676", { estado: participationStatusLabel(participation.status).toLowerCase() }),
    );
  }
  const [row] = await ctx.tx
    .select()
    .from(challenge)
    .where(eq(challenge.id, participation.challengeId))
    .for("share")
    .limit(1);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  // La revisión decide entregas de evidencia, las de su bandeja (ADR-122 regla 7): la guarda del
  // envío. La presencial pendiente la decide su asistencia; acá se trata como inexistente.
  if (row.kind !== "EVIDENCE") {
    throw new DomainError(t("T-032"));
  }
  if (input.decision === "APPROVE") {
    let granted: RewardRow | null = null;
    if (participation.rewardId) {
      const reserved = await rewardOf(ctx, participation.rewardId);
      granted = await grantReward(
        ctx,
        participation.rewardId,
        rewardReasons(row, reserved ? reserved.personalPercent + reserved.campaignPercent : 0),
        now,
      );
    }
    await ctx.tx
      .update(challengeParticipation)
      .set({
        status: "COMPLETED",
        decidedAt: now,
        decidedById: ctx.actor.personId,
        updatedAt: now,
      })
      .where(eq(challengeParticipation.id, participation.id));
    await ctx.audit({
      action: "challenge.reviewed",
      entityType: "challenge_participation",
      entityId: participation.id,
      before: { status: "PENDING" },
      after: { status: "COMPLETED", challengeId: row.id },
    });
    if (granted) {
      await emitCompleted(ctx, row, participation, granted);
    }
    return;
  }
  const cleanReason = input.reason?.trim() ?? "";
  if (!cleanReason) {
    throw new DomainError(t("T-2564"), "reason");
  }
  if (participation.rewardId) {
    await releaseReward(ctx, participation.rewardId, cleanReason);
  }
  await ctx.tx
    .update(challengeParticipation)
    .set({
      status: "REJECTED",
      reason: cleanReason,
      decidedAt: now,
      decidedById: ctx.actor.personId,
      updatedAt: now,
    })
    .where(eq(challengeParticipation.id, participation.id));
  await ctx.audit({
    action: "challenge.reviewed",
    entityType: "challenge_participation",
    entityId: participation.id,
    before: { status: "PENDING" },
    after: { status: "REJECTED", challengeId: row.id, reason: cleanReason },
  });
  await emitRejected(ctx, row, participation, cleanReason);
}

/** Anula un premio entregado: reversión con motivo; el step-up lo exige la acción (T-2586). */
export async function annulParticipation(
  ctx: CommandContext,
  participationId: string,
  reason: string,
  now = new Date(),
): Promise<void> {
  const [participation] = await ctx.tx
    .select()
    .from(challengeParticipation)
    .where(eq(challengeParticipation.id, participationId))
    .for("update")
    .limit(1);
  if (!participation) {
    throw new DomainError(t("T-032"));
  }
  if (participation.status !== "COMPLETED") {
    throw new DomainError(
      t("T-676", { estado: participationStatusLabel(participation.status).toLowerCase() }),
    );
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new DomainError(t("T-2564"), "reason");
  }
  if (participation.rewardId) {
    await reverseReward(ctx, participation.rewardId, cleanReason, now);
  }
  await ctx.tx
    .update(challengeParticipation)
    .set({
      status: "ANNULLED",
      reason: cleanReason,
      decidedAt: now,
      decidedById: ctx.actor.personId,
      updatedAt: now,
    })
    .where(eq(challengeParticipation.id, participation.id));
  await ctx.audit({
    action: "challenge.annulled",
    entityType: "challenge_participation",
    entityId: participation.id,
    before: { status: "COMPLETED" },
    after: { status: "ANNULLED", reason: cleanReason },
  });
}

// Lecturas.

export interface PendingReviewRow extends AdminParticipantRow {
  challenge: { id: string; title: string; kind: ChallengeRow["kind"] };
}

/** Entregas de evidencia del término por revisar (o todas), de la más vieja a la más nueva. */
export async function listPendingReviews(
  termId: string,
  options: { all?: boolean } = {},
): Promise<PendingReviewRow[]> {
  const db = getDb();
  const termChallenges = db
    .select({ id: challenge.id })
    .from(challenge)
    .where(and(eq(challenge.termId, termId), eq(challenge.kind, "EVIDENCE")));
  const rows = await listParticipantRows(
    db,
    and(
      inArray(challengeParticipation.challengeId, termChallenges),
      options.all ? undefined : eq(challengeParticipation.status, "PENDING"),
    ),
  );
  if (rows.length === 0) {
    return [];
  }
  const challenges = await db
    .select({ id: challenge.id, title: challenge.title, kind: challenge.kind })
    .from(challenge)
    .where(
      inArray(
        challenge.id,
        rows.map((row) => row.participation.challengeId),
      ),
    );
  const byId = new Map(challenges.map((row) => [row.id, row]));
  return rows.map((row) => ({
    ...row,
    challenge: byId.get(row.participation.challengeId) ?? {
      id: row.participation.challengeId,
      title: "",
      kind: "EVIDENCE" as const,
    },
  }));
}

/** Todas las participaciones de una persona (para Mis datos, G-T6). */
export async function listParticipationsForPerson(personId: string): Promise<ParticipationRow[]> {
  return getDb()
    .select()
    .from(challengeParticipation)
    .where(eq(challengeParticipation.personId, personId))
    .orderBy(asc(challengeParticipation.submittedAt));
}
