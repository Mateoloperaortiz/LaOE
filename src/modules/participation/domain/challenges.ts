import { and, asc, count, desc, eq, gt, inArray, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { getPeopleByIds } from "@/modules/people";
import { lockOpenTermPoints } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import type {
  BoosterKind,
  CampaignPercent,
  ChallengeAudience,
  ChallengeKind,
  ChallengeState,
  MemberChallengeStatus,
  ParticipationStatus,
  RewardStatus,
} from "../gamification-types";
import {
  boostCampaign,
  boosterItem,
  challenge,
  challengeEvidenceFile,
  challengeParticipation,
  challengeQuestion,
  occasion,
  reward,
} from "../schema";
import { audienceIncludes, challengeState, memberChallengeStatus } from "./gamification-pure";
import type { MemberContext } from "./member-context";
import type { RewardRow } from "./rewards";
import { releaseReward } from "./rewards";

// Retos relámpago (ADR-067 reglas 1, 2, 3 y 15): el editor del admin escribe borradores; publicar
// congela formato, público, premio, umbral, preguntas y ocasión. Las lecturas del miembro son
// proyecciones explícitas: `correctIndex` nunca sale antes del cierre.

export type ChallengeRow = typeof challenge.$inferSelect;
export type ChallengeQuestionRow = typeof challengeQuestion.$inferSelect;
export type ParticipationRow = typeof challengeParticipation.$inferSelect;
export type EvidenceFileRow = typeof challengeEvidenceFile.$inferSelect;

const editorErrors = tList("T-2520");

const questionSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, editorErrors[8] ?? "")
    .max(300),
  options: z
    .array(
      z
        .string()
        .trim()
        .min(1, editorErrors[8] ?? "")
        .max(120),
    )
    .min(2, editorErrors[3] ?? "")
    .max(6, editorErrors[3] ?? ""),
  correctIndex: z.coerce.number().int().min(0),
});

/** El editor conserva las preguntas de trivia al cambiar de formato: solo una trivia las valida. */
function withoutForeignQuestions(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "kind" in raw && raw.kind !== "TRIVIA") {
    return { ...raw, questions: [] };
  }
  return raw;
}

const optionalId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().min(1).max(80).nullable().default(null),
);

const optionalPercent = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().int().min(1).max(100).nullable().default(null),
);

export const challengeInputSchema = z.preprocess(
  withoutForeignQuestions,
  z
    .object({
      kind: z.enum(["PRESENTIAL", "TRIVIA", "EVIDENCE"]),
      title: z.string().trim().min(1).max(120),
      description: z.string().max(4000).default(""),
      audience: z.enum(["ALL", "NEW", "VETERAN", "COMMITTEES"]).default("ALL"),
      audienceCommitteeIds: z.array(z.string().trim().min(1).max(80)).max(60).default([]),
      opensAt: z.coerce.date(),
      closesAt: z.coerce.date(),
      basePoints: z.coerce
        .number()
        .int()
        .min(0, editorErrors[5] ?? "")
        .max(20, editorErrors[5] ?? ""),
      passPercent: optionalPercent,
      occasionId: optionalId,
      questions: z.array(questionSchema).max(5).default([]),
    })
    .superRefine((input, ctx) => {
      if (input.closesAt <= input.opensAt) {
        ctx.addIssue({ code: "custom", path: ["closesAt"], message: editorErrors[0] ?? "" });
      }
      if (input.audience === "COMMITTEES" && input.audienceCommitteeIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["audienceCommitteeIds"],
          message: editorErrors[1] ?? "",
        });
      }
      if (input.kind === "TRIVIA" && input.questions.length === 0) {
        ctx.addIssue({ code: "custom", path: ["questions"], message: editorErrors[2] ?? "" });
      }
      for (const [index, question] of input.questions.entries()) {
        if (question.correctIndex >= question.options.length) {
          ctx.addIssue({
            code: "custom",
            path: ["questions", index, "correctIndex"],
            message: editorErrors[3] ?? "",
          });
        }
      }
      if (input.kind === "PRESENTIAL" && !input.occasionId) {
        ctx.addIssue({ code: "custom", path: ["occasionId"], message: editorErrors[4] ?? "" });
      }
    }),
);

export type ChallengeInput = z.infer<typeof challengeInputSchema>;

/** Lo que el wrapper resuelve fuera de la transacción: el término de la apertura y el umbral por defecto. */
export interface ChallengeWriteContext {
  termId: string;
  defaultPassPercent: number;
}

/** La ocasión vinculada de un reto presencial: del mismo término, viva y con puntos (T-2520[4]). */
async function assertPresentialOccasion(
  exec: Executor,
  occasionId: string,
  termId: string,
): Promise<void> {
  const [row] = await exec
    .select({
      id: occasion.id,
      termId: occasion.termId,
      status: occasion.status,
      points: occasion.points,
    })
    .from(occasion)
    .where(eq(occasion.id, occasionId))
    .limit(1);
  if (!row || row.status === "CANCELLED" || row.points <= 0 || row.termId !== termId) {
    throw new DomainError(editorErrors[4] ?? "", "occasionId");
  }
}

function toValues(input: ChallengeInput, context: ChallengeWriteContext) {
  return {
    termId: context.termId,
    kind: input.kind,
    title: input.title,
    description: input.description,
    audience: input.audience,
    audienceCommitteeIds: input.audience === "COMMITTEES" ? input.audienceCommitteeIds : [],
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    basePoints: input.basePoints,
    passPercent: input.kind === "TRIVIA" ? (input.passPercent ?? context.defaultPassPercent) : null,
    occasionId: input.kind === "PRESENTIAL" ? input.occasionId : null,
  };
}

async function replaceQuestions(
  ctx: CommandContext,
  challengeId: string,
  input: ChallengeInput,
): Promise<void> {
  await ctx.tx.delete(challengeQuestion).where(eq(challengeQuestion.challengeId, challengeId));
  if (input.kind !== "TRIVIA" || input.questions.length === 0) {
    return;
  }
  await ctx.tx.insert(challengeQuestion).values(
    input.questions.map((question, index) => ({
      challengeId,
      ordinal: index + 1,
      prompt: question.prompt,
      options: question.options,
      correctIndex: question.correctIndex,
    })),
  );
}

export async function createChallenge(
  ctx: CommandContext,
  input: ChallengeInput,
  context: ChallengeWriteContext,
): Promise<{ id: string }> {
  if (input.kind === "PRESENTIAL" && input.occasionId) {
    await assertPresentialOccasion(ctx.tx, input.occasionId, context.termId);
  }
  const [created] = await ctx.tx
    .insert(challenge)
    .values({ ...toValues(input, context), createdById: ctx.actor.personId })
    .returning({ id: challenge.id });
  if (!created) {
    throw new Error("No se pudo crear el reto");
  }
  await replaceQuestions(ctx, created.id, input);
  await ctx.audit({
    action: "challenge.created",
    entityType: "challenge",
    entityId: created.id,
    after: { title: input.title, kind: input.kind, termId: context.termId },
  });
  return created;
}

/**
 * Edición congelada (ADR-067 regla 3): en DRAFT se reemplaza todo; publicado o cerrado solo
 * cambian título y descripción. Un reto cancelado ya no se edita.
 */
export async function updateChallenge(
  ctx: CommandContext,
  id: string,
  input: ChallengeInput,
  context: ChallengeWriteContext,
): Promise<void> {
  const [row] = await ctx.tx.select().from(challenge).where(eq(challenge.id, id)).for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status === "CANCELLED") {
    throw new DomainError(editorErrors[7] ?? "");
  }
  if (row.status !== "DRAFT") {
    await ctx.tx
      .update(challenge)
      .set({ title: input.title, description: input.description, updatedAt: new Date() })
      .where(eq(challenge.id, id));
    await ctx.audit({
      action: "challenge.updated",
      entityType: "challenge",
      entityId: id,
      before: { title: row.title, description: row.description },
      after: { title: input.title, description: input.description },
    });
    return;
  }
  if (input.kind === "PRESENTIAL" && input.occasionId) {
    await assertPresentialOccasion(ctx.tx, input.occasionId, row.termId);
  }
  await ctx.tx
    .update(challenge)
    .set({ ...toValues(input, { ...context, termId: row.termId }), updatedAt: new Date() })
    .where(eq(challenge.id, id));
  await replaceQuestions(ctx, id, input);
  await ctx.audit({
    action: "challenge.updated",
    entityType: "challenge",
    entityId: id,
    after: { title: input.title, kind: input.kind },
  });
}

async function questionsOf(exec: Executor, challengeId: string): Promise<ChallengeQuestionRow[]> {
  return exec
    .select()
    .from(challengeQuestion)
    .where(eq(challengeQuestion.challengeId, challengeId))
    .orderBy(asc(challengeQuestion.ordinal));
}

/** Revalida todo lo que se congela al publicar: ventana vigente, preguntas y ocasión válidas. */
async function assertPublishable(ctx: CommandContext, row: ChallengeRow, now: Date): Promise<void> {
  if (row.closesAt <= now) {
    throw new DomainError(editorErrors[0] ?? "", "closesAt");
  }
  if (row.kind === "TRIVIA") {
    const questions = await questionsOf(ctx.tx, row.id);
    if (questions.length < 1 || questions.length > 5) {
      throw new DomainError(editorErrors[2] ?? "", "questions");
    }
  }
  if (row.kind === "PRESENTIAL") {
    if (!row.occasionId) {
      throw new DomainError(editorErrors[4] ?? "", "occasionId");
    }
    await assertPresentialOccasion(ctx.tx, row.occasionId, row.termId);
  }
}

export async function publishChallenge(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<void> {
  const [row] = await ctx.tx.select().from(challenge).where(eq(challenge.id, id)).for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== "DRAFT") {
    throw new DomainError(editorErrors[6] ?? "");
  }
  await lockOpenTermPoints(ctx.tx, row.termId);
  await assertPublishable(ctx, row, now);
  await ctx.tx
    .update(challenge)
    .set({
      status: "PUBLISHED",
      publishedAt: now,
      publishedById: ctx.actor.personId,
      updatedAt: now,
    })
    .where(eq(challenge.id, id));
  await ctx.audit({
    action: "challenge.published",
    entityType: "challenge",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "PUBLISHED", opensAt: row.opensAt, closesAt: row.closesAt },
  });
  await ctx.emit({
    type: "challenge.published",
    payload: {
      challengeId: row.id,
      termId: row.termId,
      title: row.title,
      kind: row.kind,
      closesAt: row.closesAt.toISOString(),
      audience: row.audience,
      audienceCommitteeIds: row.audienceCommitteeIds,
      basePoints: row.basePoints,
    },
  });
}

/**
 * Cancelación (ADR-067 regla 17): libera las reservas pendientes y marca sus entregas REJECTED
 * con el motivo automático T-2581; los premios ya entregados se conservan (se anulan uno a uno).
 */
export async function cancelChallenge(
  ctx: CommandContext,
  id: string,
  reason: string,
  context: { caps: { daily: number; weekly: number } },
  now = new Date(),
): Promise<{ released: number; granted: number }> {
  void context;
  const [row] = await ctx.tx.select().from(challenge).where(eq(challenge.id, id)).for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status === "CANCELLED") {
    throw new DomainError(t("T-676", { estado: tList("T-2511")[4] ?? "" }));
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new DomainError(t("T-2564"), "reason");
  }
  const pending = await ctx.tx
    .select()
    .from(challengeParticipation)
    .where(
      and(eq(challengeParticipation.challengeId, id), eq(challengeParticipation.status, "PENDING")),
    )
    .for("update");
  const autoReason = t("T-2581", { motivo: cleanReason });
  for (const part of pending) {
    if (part.rewardId) {
      await releaseReward(ctx, part.rewardId, autoReason);
    }
    await ctx.tx
      .update(challengeParticipation)
      .set({
        status: "REJECTED",
        reason: autoReason,
        decidedAt: now,
        decidedById: ctx.actor.personId,
        updatedAt: now,
      })
      .where(eq(challengeParticipation.id, part.id));
    await ctx.emit({
      type: "challenge.rejected",
      payload: {
        participationId: part.id,
        challengeId: row.id,
        challengeTitle: row.title,
        personId: part.personId,
        termId: row.termId,
        reason: autoReason,
      },
    });
  }
  const [granted] = await ctx.tx
    .select({ n: count() })
    .from(challengeParticipation)
    .where(
      and(
        eq(challengeParticipation.challengeId, id),
        eq(challengeParticipation.status, "COMPLETED"),
      ),
    );
  await ctx.tx
    .update(challenge)
    .set({
      status: "CANCELLED",
      cancelledAt: now,
      cancelReason: cleanReason,
      updatedAt: now,
    })
    .where(eq(challenge.id, id));
  await ctx.audit({
    action: "challenge.cancelled",
    entityType: "challenge",
    entityId: id,
    before: { status: row.status },
    after: { status: "CANCELLED", reason: cleanReason, released: pending.length },
  });
  return { released: pending.length, granted: granted?.n ?? 0 };
}

/** Si el reto ya entregó premios, cancelarlo exige step-up (la acción lo decide). */
export async function hasGrantedRewards(
  challengeId: string,
  exec: Executor = getDb(),
): Promise<boolean> {
  const [row] = await exec
    .select({ n: count() })
    .from(challengeParticipation)
    .where(
      and(
        eq(challengeParticipation.challengeId, challengeId),
        eq(challengeParticipation.status, "COMPLETED"),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/** Copia un reto a un borrador nuevo: mismas condiciones y preguntas, sin participaciones. */
export async function duplicateChallenge(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<{ id: string }> {
  const [row] = await ctx.tx.select().from(challenge).where(eq(challenge.id, id));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  const questions = await questionsOf(ctx.tx, id);
  const opensAt = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const closesAt = new Date(opensAt.getTime() + (row.closesAt.getTime() - row.opensAt.getTime()));
  const [created] = await ctx.tx
    .insert(challenge)
    .values({
      termId: row.termId,
      kind: row.kind,
      status: "DRAFT",
      title: row.title,
      description: row.description,
      audience: row.audience,
      audienceCommitteeIds: row.audienceCommitteeIds,
      opensAt,
      closesAt,
      basePoints: row.basePoints,
      passPercent: row.passPercent,
      occasionId: row.occasionId,
      duplicatedFromId: row.id,
      createdById: ctx.actor.personId,
    })
    .returning({ id: challenge.id });
  if (!created) {
    throw new Error("No se pudo duplicar el reto");
  }
  if (questions.length > 0) {
    await ctx.tx.insert(challengeQuestion).values(
      questions.map((question) => ({
        challengeId: created.id,
        ordinal: question.ordinal,
        prompt: question.prompt,
        options: question.options,
        correctIndex: question.correctIndex,
      })),
    );
  }
  await ctx.audit({
    action: "challenge.duplicated",
    entityType: "challenge",
    entityId: created.id,
    after: { duplicatedFromId: row.id, title: row.title },
  });
  return created;
}

// Lecturas del admin.

export interface ChallengeAdminRow extends ChallengeRow {
  state: ChallengeState;
  participants: number;
  pending: number;
}

export async function listChallengesAdmin(params: {
  termId?: string | undefined;
  state?: ChallengeState | undefined;
  kind?: ChallengeKind | undefined;
  page: number;
  pageSize: number;
  now?: Date | undefined;
}): Promise<{ rows: ChallengeAdminRow[]; total: number }> {
  const now = params.now ?? new Date();
  const conditions = [];
  if (params.termId) {
    conditions.push(eq(challenge.termId, params.termId));
  }
  if (params.kind) {
    conditions.push(eq(challenge.kind, params.kind));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await getDb()
    .select({
      row: challenge,
      participants: count(challengeParticipation.id),
      pending: sql<number>`count(${challengeParticipation.id}) filter (where ${challengeParticipation.status} = 'PENDING')::int`,
    })
    .from(challenge)
    .leftJoin(challengeParticipation, eq(challengeParticipation.challengeId, challenge.id))
    .where(where)
    .groupBy(challenge.id)
    .orderBy(desc(challenge.opensAt));
  const mapped = rows.map((item) => ({
    ...item.row,
    state: challengeState(item.row, now),
    participants: item.participants,
    pending: item.pending,
  }));
  const filtered = params.state ? mapped.filter((row) => row.state === params.state) : mapped;
  const start = (params.page - 1) * params.pageSize;
  return { rows: filtered.slice(start, start + params.pageSize), total: filtered.length };
}

export interface AdminParticipantRow {
  participation: ParticipationRow;
  personId: string;
  personName: string;
  reward: RewardRow | null;
  boosterKind: BoosterKind | null;
  files: EvidenceFileRow[];
}

/** Filas de participantes de un reto con nombre, premio, booster y evidencias. */
async function participantRows(
  exec: Executor,
  where: SQL | undefined,
): Promise<
  Array<{
    participation: ParticipationRow;
    reward: RewardRow | null;
    boosterKind: BoosterKind | null;
  }>
> {
  return exec
    .select({
      participation: challengeParticipation,
      reward,
      boosterKind: boosterItem.kind,
    })
    .from(challengeParticipation)
    .leftJoin(reward, eq(reward.id, challengeParticipation.rewardId))
    .leftJoin(boosterItem, eq(boosterItem.id, reward.boosterItemId))
    .where(where)
    .orderBy(asc(challengeParticipation.submittedAt));
}

/** Participaciones con nombre, premio, booster y evidencias: la fila de la consola y la revisión. */
export async function listParticipantRows(
  exec: Executor,
  where: SQL | undefined,
): Promise<AdminParticipantRow[]> {
  const rows = await participantRows(exec, where);
  return attachNamesAndFiles(exec, rows);
}

async function attachNamesAndFiles(
  exec: Executor,
  rows: Array<{
    participation: ParticipationRow;
    reward: RewardRow | null;
    boosterKind: BoosterKind | null;
  }>,
): Promise<AdminParticipantRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const [people, files] = await Promise.all([
    getPeopleByIds(rows.map((row) => row.participation.personId)),
    exec
      .select()
      .from(challengeEvidenceFile)
      .where(
        inArray(
          challengeEvidenceFile.participationId,
          rows.map((row) => row.participation.id),
        ),
      )
      .orderBy(asc(challengeEvidenceFile.ordinal)),
  ]);
  const filesByParticipation = new Map<string, EvidenceFileRow[]>();
  for (const file of files) {
    const list = filesByParticipation.get(file.participationId) ?? [];
    list.push(file);
    filesByParticipation.set(file.participationId, list);
  }
  return rows.map((row) => ({
    participation: row.participation,
    personId: row.participation.personId,
    personName: people.get(row.participation.personId)?.fullName?.trim() ?? "",
    reward: row.reward,
    boosterKind: row.boosterKind,
    files: filesByParticipation.get(row.participation.id) ?? [],
  }));
}

export async function getChallengeAdmin(
  id: string,
  now = new Date(),
): Promise<{
  challenge: ChallengeRow & { state: ChallengeState };
  questions: ChallengeQuestionRow[];
  occasion: {
    id: string;
    title: string;
    publicId: string;
    startsAt: Date;
    points: number;
  } | null;
  participants: AdminParticipantRow[];
} | null> {
  const db = getDb();
  const [row] = await db.select().from(challenge).where(eq(challenge.id, id)).limit(1);
  if (!row) {
    return null;
  }
  const [questions, occasionRow, participants] = await Promise.all([
    questionsOf(db, id),
    row.occasionId
      ? db
          .select({
            id: occasion.id,
            title: occasion.title,
            publicId: occasion.publicId,
            startsAt: occasion.startsAt,
            points: occasion.points,
          })
          .from(occasion)
          .where(eq(occasion.id, row.occasionId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    listParticipantRows(db, eq(challengeParticipation.challengeId, id)),
  ]);
  return {
    challenge: { ...row, state: challengeState(row, now) },
    questions,
    occasion: occasionRow,
    participants,
  };
}

// Boosters y campañas que aplican a un reto (ADR-067 reglas 8 y 9): el booster lo elige el miembro
// sobre el reto o sobre la ocasión vinculada; la campaña la activa GH sobre cualquiera de los dos.

/** Booster propio, vigente y apuntado al reto (o a su ocasión): prioriza el del reto. */
export async function findTargetedBooster(
  exec: Executor,
  personId: string,
  target: { challengeId?: string; occasionId?: string },
  now = new Date(),
): Promise<{ id: string; kind: BoosterKind } | null> {
  const keys = [
    target.challengeId ? eq(boosterItem.targetChallengeId, target.challengeId) : undefined,
    target.occasionId ? eq(boosterItem.targetOccasionId, target.occasionId) : undefined,
  ].filter((item): item is NonNullable<typeof item> => item !== undefined);
  for (const key of keys) {
    const [row] = await exec
      .select({ id: boosterItem.id, kind: boosterItem.kind })
      .from(boosterItem)
      .where(
        and(
          eq(boosterItem.personId, personId),
          eq(boosterItem.status, "AVAILABLE"),
          gt(boosterItem.expiresAt, now),
          key,
        ),
      )
      .limit(1);
    if (row) {
      return row;
    }
  }
  return null;
}

/** Campaña vigente de mayor porcentaje sobre el reto o su ocasión. */
export async function activeCampaignFor(
  exec: Executor,
  target: { challengeId?: string; occasionId?: string },
  now = new Date(),
): Promise<{ id: string; percent: CampaignPercent; endsAt: Date } | null> {
  const keys = [
    target.challengeId ? eq(boostCampaign.challengeId, target.challengeId) : undefined,
    target.occasionId ? eq(boostCampaign.occasionId, target.occasionId) : undefined,
  ].filter((item): item is NonNullable<typeof item> => item !== undefined);
  if (keys.length === 0) {
    return null;
  }
  const rows = await exec
    .select({ id: boostCampaign.id, percent: boostCampaign.percent, endsAt: boostCampaign.endsAt })
    .from(boostCampaign)
    .where(
      and(
        eq(boostCampaign.status, "ACTIVE"),
        lte(boostCampaign.startsAt, now),
        gt(boostCampaign.endsAt, now),
        keys.length === 1 ? keys[0] : or(keys[0], keys[1]),
      ),
    );
  let best: { id: string; percent: CampaignPercent; endsAt: Date } | null = null;
  for (const row of rows) {
    if (!best || row.percent > best.percent) {
      best = { id: row.id, percent: row.percent as CampaignPercent, endsAt: row.endsAt };
    }
  }
  return best;
}

// Lecturas del miembro: proyecciones explícitas; correctIndex solo cuando el reto cerró.

export interface MemberChallengeCard {
  id: string;
  kind: ChallengeKind;
  title: string;
  state: ChallengeState;
  opensAt: Date;
  closesAt: Date;
  basePoints: number;
  audience: ChallengeAudience;
  status: MemberChallengeStatus;
  occasion: { title: string; publicId: string; startsAt: Date } | null;
  campaignPercent: 0 | CampaignPercent;
  /** Fin de la campaña vigente, para el aviso "+n % hasta {fecha}". */
  campaignEndsAt: Date | null;
  /** El booster elegido por el miembro para este reto (G-T4: todavía sin selector). */
  boosterKind: BoosterKind | null;
  /** base + extra entregados, solo cuando la participación está COMPLETED. */
  rewardPoints: number | null;
  /** base + extra reservados, solo cuando la participación está PENDING. */
  pendingPoints: number | null;
}

export interface MemberChallengeDetail extends MemberChallengeCard {
  description: string;
  passPercent: number | null;
  questions: Array<{
    ordinal: number;
    prompt: string;
    options: string[];
    correctIndex: number | null;
  }>;
  participation: {
    status: ParticipationStatus;
    submittedAt: Date;
    answers: number[] | null;
    score: number | null;
    total: number | null;
    evidenceText: string | null;
    files: Array<{ id: string; status: string }>;
    reason: string | null;
    reward: {
      base: number;
      extra: number;
      capped: boolean;
      personalConsumed: boolean;
      /** El miembro pidió booster pero la campaña lo cubrió: quedó disponible (T-2437). */
      boosterRequested: boolean;
      status: RewardStatus;
    } | null;
  } | null;
}

interface MemberReadRow {
  row: ChallengeRow;
  participation: ParticipationRow | null;
  reward: RewardRow | null;
  occasionTitle: string | null;
  occasionPublicId: string | null;
  occasionStartsAt: Date | null;
}

// El join de la participación filtra por la persona: una fila por reto, con su entrega si existe.
function memberSelect(exec: Executor, personId: string) {
  return exec
    .select({
      row: challenge,
      participation: challengeParticipation,
      reward,
      occasionTitle: occasion.title,
      occasionPublicId: occasion.publicId,
      occasionStartsAt: occasion.startsAt,
    })
    .from(challenge)
    .leftJoin(
      challengeParticipation,
      and(
        eq(challengeParticipation.challengeId, challenge.id),
        eq(challengeParticipation.personId, personId),
      ),
    )
    .leftJoin(reward, eq(reward.id, challengeParticipation.rewardId))
    .leftJoin(occasion, eq(occasion.id, challenge.occasionId));
}

function toCard(
  item: MemberReadRow,
  personId: string,
  state: ChallengeState,
  campaigns: Map<string, { percent: CampaignPercent; endsAt: Date }>,
  boosterKinds: Map<string, BoosterKind>,
): MemberChallengeCard {
  const participation =
    item.participation && item.participation.personId === personId ? item.participation : null;
  const rewardRow = participation ? item.reward : null;
  return {
    id: item.row.id,
    kind: item.row.kind,
    title: item.row.title,
    state,
    opensAt: item.row.opensAt,
    closesAt: item.row.closesAt,
    basePoints: item.row.basePoints,
    audience: item.row.audience,
    status: memberChallengeStatus(state, participation),
    occasion:
      item.occasionTitle && item.occasionPublicId && item.occasionStartsAt
        ? {
            title: item.occasionTitle,
            publicId: item.occasionPublicId,
            startsAt: item.occasionStartsAt,
          }
        : null,
    campaignPercent: campaigns.get(item.row.id)?.percent ?? 0,
    campaignEndsAt: campaigns.get(item.row.id)?.endsAt ?? null,
    boosterKind: boosterKinds.get(item.row.id) ?? null,
    rewardPoints:
      participation?.status === "COMPLETED" && rewardRow
        ? rewardRow.baseGranted + rewardRow.extraPoints
        : null,
    pendingPoints:
      participation?.status === "PENDING" && rewardRow
        ? rewardRow.baseGranted + rewardRow.extraPoints
        : null,
  };
}

/** Campañas activas ahora sobre los retos dados (o sus ocasiones vinculadas). */
async function campaignPercentsFor(
  rows: MemberReadRow[],
  now: Date,
  exec: Executor,
): Promise<Map<string, { percent: CampaignPercent; endsAt: Date }>> {
  const challengeIds = rows.map((item) => item.row.id);
  const occasionIds = rows
    .map((item) => item.row.occasionId)
    .filter((id): id is string => id !== null);
  if (challengeIds.length === 0) {
    return new Map();
  }
  const campaigns = await exec
    .select({
      percent: boostCampaign.percent,
      endsAt: boostCampaign.endsAt,
      challengeId: boostCampaign.challengeId,
      occasionId: boostCampaign.occasionId,
    })
    .from(boostCampaign)
    .where(
      and(
        eq(boostCampaign.status, "ACTIVE"),
        lte(boostCampaign.startsAt, now),
        gt(boostCampaign.endsAt, now),
        occasionIds.length > 0
          ? or(
              inArray(boostCampaign.challengeId, challengeIds),
              inArray(boostCampaign.occasionId, occasionIds),
            )
          : inArray(boostCampaign.challengeId, challengeIds),
      ),
    );
  const byChallenge = new Map<string, { percent: CampaignPercent; endsAt: Date }>();
  const occasionOf = new Map(
    rows
      .filter((item) => item.row.occasionId !== null)
      .map((item) => [item.row.occasionId as string, item.row.id]),
  );
  for (const campaign of campaigns) {
    const targets = [
      campaign.challengeId,
      campaign.occasionId ? occasionOf.get(campaign.occasionId) : undefined,
    ];
    for (const targetId of targets) {
      if (!targetId) continue;
      const current = byChallenge.get(targetId);
      if (!current || campaign.percent > current.percent) {
        byChallenge.set(targetId, {
          percent: campaign.percent as CampaignPercent,
          endsAt: campaign.endsAt,
        });
      }
    }
  }
  return byChallenge;
}

/** Boosters vigentes del miembro apuntados a los retos dados. */
async function boosterKindsFor(
  personId: string,
  challengeIds: string[],
  now: Date,
  exec: Executor,
): Promise<Map<string, BoosterKind>> {
  if (challengeIds.length === 0) {
    return new Map();
  }
  const rows = await exec
    .select({ kind: boosterItem.kind, targetChallengeId: boosterItem.targetChallengeId })
    .from(boosterItem)
    .where(
      and(
        eq(boosterItem.personId, personId),
        eq(boosterItem.status, "AVAILABLE"),
        gt(boosterItem.expiresAt, now),
        inArray(boosterItem.targetChallengeId, challengeIds),
      ),
    );
  const map = new Map<string, BoosterKind>();
  for (const row of rows) {
    if (row.targetChallengeId) {
      map.set(row.targetChallengeId, row.kind);
    }
  }
  return map;
}

/**
 * Los retos del término que la persona puede ver: publicados (programados, abiertos o cerrados),
 * de su público. Los cerrados se conservan solo si participó o cerraron hace menos de 30 días.
 */
export async function listChallengesForMember(
  personId: string,
  termId: string,
  member: MemberContext | null,
  now = new Date(),
): Promise<MemberChallengeCard[]> {
  const db = getDb();
  const rows = (await memberSelect(db, personId).where(
    and(eq(challenge.termId, termId), eq(challenge.status, "PUBLISHED")),
  )) as MemberReadRow[];
  const list = rows.filter((item) => {
    const state = challengeState(item.row, now);
    if (state === "DRAFT" || state === "CANCELLED") return false;
    if (!audienceIncludes(item.row, member)) return false;
    if (state === "CLOSED") {
      const participated = Boolean(item.participation);
      const recent = now.getTime() - item.row.closesAt.getTime() <= 30 * 86_400_000;
      if (!participated && !recent) return false;
    }
    return true;
  });
  const [campaigns, boosters] = await Promise.all([
    campaignPercentsFor(list, now, db),
    boosterKindsFor(
      personId,
      list.map((item) => item.row.id),
      now,
      db,
    ),
  ]);
  return list
    .map((item) => toCard(item, personId, challengeState(item.row, now), campaigns, boosters))
    .sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime());
}

export async function getChallengeForMember(
  id: string,
  personId: string,
  member: MemberContext | null,
  now = new Date(),
): Promise<MemberChallengeDetail | null> {
  const db = getDb();
  const [item] = (await memberSelect(db, personId).where(
    and(eq(challenge.id, id), eq(challenge.status, "PUBLISHED")),
  )) as MemberReadRow[];
  if (!item || !audienceIncludes(item.row, member)) {
    return null;
  }
  const state = challengeState(item.row, now);
  const questions = await questionsOf(db, id);
  const participation =
    item.participation && item.participation.personId === personId ? item.participation : null;
  const files = participation
    ? await db
        .select({ id: challengeEvidenceFile.id, status: challengeEvidenceFile.status })
        .from(challengeEvidenceFile)
        .where(eq(challengeEvidenceFile.participationId, participation.id))
        .orderBy(asc(challengeEvidenceFile.ordinal))
    : [];
  const [campaigns, boosters] = await Promise.all([
    campaignPercentsFor([item], now, db),
    boosterKindsFor(personId, [id], now, db),
  ]);
  const card = toCard(item, personId, state, campaigns, boosters);
  const revealAnswers = state === "CLOSED";
  const rewardRow = participation ? item.reward : null;
  const extraRequested = rewardRow
    ? Math.floor(
        (rewardRow.basePoints *
          Math.min(rewardRow.personalPercent + rewardRow.campaignPercent, 100)) /
          100,
      )
    : 0;
  return {
    ...card,
    description: item.row.description,
    passPercent: item.row.passPercent,
    questions: questions.map((question) => ({
      ordinal: question.ordinal,
      prompt: question.prompt,
      options: question.options,
      correctIndex: revealAnswers ? question.correctIndex : null,
    })),
    participation: participation
      ? {
          status: participation.status,
          submittedAt: participation.submittedAt,
          answers: participation.answers,
          score: participation.score,
          total: questions.length > 0 ? questions.length : null,
          evidenceText: participation.evidenceText,
          files,
          reason: participation.reason,
          reward: rewardRow
            ? {
                base: rewardRow.baseGranted,
                extra: rewardRow.extraPoints,
                capped:
                  rewardRow.baseGranted < rewardRow.basePoints ||
                  rewardRow.extraPoints < extraRequested,
                personalConsumed: rewardRow.boosterItemId !== null,
                boosterRequested:
                  rewardRow.requestedPersonalPercent > 0 && rewardRow.boosterItemId === null,
                status: rewardRow.status,
              }
            : null,
        }
      : null,
  };
}

/** El reto abierto sin participación con la fecha límite más próxima (para Mi OE). */
export async function nextChallengeForMember(
  personId: string,
  termId: string,
  member: MemberContext | null,
  now = new Date(),
): Promise<MemberChallengeCard | null> {
  const cards = await listChallengesForMember(personId, termId, member, now);
  return cards.find((card) => card.state === "OPEN" && card.status === "AVAILABLE") ?? null;
}

/** La fila del reto, sin adornos (para resolver termId antes de abrir la transacción). */
export async function findChallenge(id: string): Promise<ChallengeRow | null> {
  const [row] = await getDb().select().from(challenge).where(eq(challenge.id, id)).limit(1);
  return row ?? null;
}
