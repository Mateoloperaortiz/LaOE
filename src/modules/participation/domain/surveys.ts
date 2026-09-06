import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, enqueueEvent, runCommand } from "@/db/tx";
import { type FormField, getForm, parseFields, validateAnswers } from "@/modules/forms";
import { requireConfig } from "@/modules/system";
import { t } from "@/shared/copy";
import { splitTitleBody } from "@/shared/copy/render";
import { checkIn, occasion, occasionSurveyInvite, occasionSurveyResponse } from "../schema";
import { type SurveySummary, summarizeAnswers } from "./surveys-pure";

// Encuesta anónima tras la ocasión (ADR-038 regla 13): al cerrar, una invitación con token por
// asistente aprobado; la respuesta se guarda sin persona y la invitación queda marcada como
// respondida. Los agregados salen por ocasión y por comité.

const MAX_RECIPIENTS = 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedInvite {
  personId: string;
  token: string;
}

/**
 * Crea las invitaciones que falten para los check-ins aprobados de una ocasión cerrada con encuesta y
 * manda el push T-191 con la URL propia de cada persona. Idempotente por (ocasión, persona).
 */
export async function createSurveyInvites(
  occasionId: string,
  now = new Date(),
): Promise<{ created: CreatedInvite[]; invited: number }> {
  const db = getDb();
  const [row] = await db.select().from(occasion).where(eq(occasion.id, occasionId)).limit(1);
  if (!row || !row.surveyFormId || row.status !== "CLOSED") {
    return { created: [], invited: 0 };
  }
  const form = await getForm(row.surveyFormId);
  if (!form) {
    return { created: [], invited: 0 };
  }
  const approved = await db
    .select({ personId: checkIn.personId })
    .from(checkIn)
    .where(and(eq(checkIn.occasionId, occasionId), eq(checkIn.status, "APPROVED")));
  const existing = new Set(
    (
      await db
        .select({ personId: occasionSurveyInvite.personId })
        .from(occasionSurveyInvite)
        .where(eq(occasionSurveyInvite.occasionId, occasionId))
    ).map((item) => item.personId),
  );
  const created: CreatedInvite[] = [];
  for (const item of approved) {
    if (existing.has(item.personId)) {
      continue;
    }
    const token = randomBytes(24).toString("base64url");
    const inserted = await db
      .insert(occasionSurveyInvite)
      .values({ occasionId, personId: item.personId, tokenHash: hashToken(token), sentAt: now })
      .onConflictDoNothing()
      .returning({ id: occasionSurveyInvite.id });
    if (inserted.length > 0) {
      created.push({ personId: item.personId, token });
    }
  }
  const { title, body } = splitTitleBody(t("T-191", { actividad: row.title }));
  for (let start = 0; start < created.length; start += MAX_RECIPIENTS) {
    const chunk = created.slice(start, start + MAX_RECIPIENTS);
    await enqueueEvent(db, {
      type: "notification.requested",
      payload: {
        kind: "SURVEY",
        recipients: chunk.map((item) => ({
          personId: item.personId,
          url: `/app/encuesta/${item.token}`,
        })),
        title,
        body,
        url: "/app",
        tag: `survey-${occasionId}`,
        dedupeKey: `survey:${occasionId}`,
      },
      dedupeKey: `survey:${occasionId}:${start / MAX_RECIPIENTS}`,
    });
  }
  return { created, invited: approved.length };
}

export type SurveyInviteState =
  | { state: "NOT_FOUND" }
  | { state: "ANSWERED"; occasionTitle: string }
  | { state: "EXPIRED"; occasionTitle: string }
  | {
      state: "OPEN";
      inviteId: string;
      occasionId: string;
      occasionTitle: string;
      fields: FormField[];
    };

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/** La invitación del actor por su token: abierta, ya respondida, vencida o inexistente. */
export async function getSurveyInviteForActor(
  personId: string,
  token: string,
  now = new Date(),
): Promise<SurveyInviteState> {
  if (!TOKEN.test(token)) {
    return { state: "NOT_FOUND" };
  }
  const db = getDb();
  const [invite] = await db
    .select()
    .from(occasionSurveyInvite)
    .where(eq(occasionSurveyInvite.tokenHash, hashToken(token)))
    .limit(1);
  if (!invite || invite.personId !== personId) {
    return { state: "NOT_FOUND" };
  }
  const [row] = await db.select().from(occasion).where(eq(occasion.id, invite.occasionId)).limit(1);
  if (!row || !row.surveyFormId) {
    return { state: "NOT_FOUND" };
  }
  if (invite.answeredAt) {
    return { state: "ANSWERED", occasionTitle: row.title };
  }
  const windowDays = await requireConfig("survey.windowDays");
  const closedAt = row.closedAt ?? row.checkInClosesAt;
  if (now.getTime() - closedAt.getTime() > windowDays * 86_400_000) {
    return { state: "EXPIRED", occasionTitle: row.title };
  }
  const form = await getForm(row.surveyFormId);
  if (!form) {
    return { state: "NOT_FOUND" };
  }
  return {
    state: "OPEN",
    inviteId: invite.id,
    occasionId: row.id,
    occasionTitle: row.title,
    fields: parseFields(form.fields),
  };
}

export type AnswerSurveyResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> }
  | { ok: false; state: "ANSWERED" | "EXPIRED" | "NOT_FOUND" };

async function answerSurvey(
  ctx: CommandContext,
  invite: Extract<SurveyInviteState, { state: "OPEN" }>,
  answers: Record<string, unknown>,
  now: Date,
): Promise<void> {
  const [row] = await ctx.tx
    .select()
    .from(occasionSurveyInvite)
    .where(eq(occasionSurveyInvite.id, invite.inviteId))
    .for("update");
  if (!row || row.answeredAt) {
    return;
  }
  const [occ] = await ctx.tx
    .select({ committeeId: occasion.committeeId })
    .from(occasion)
    .where(eq(occasion.id, invite.occasionId));
  await ctx.tx
    .insert(occasionSurveyResponse)
    .values({ occasionId: invite.occasionId, committeeId: occ?.committeeId ?? null, answers });
  await ctx.tx
    .update(occasionSurveyInvite)
    .set({ answeredAt: now })
    .where(eq(occasionSurveyInvite.id, invite.inviteId));
  // La auditoría registra que la persona respondió, nunca qué (ADR-038 regla 13).
  await ctx.audit({
    action: "survey.answered",
    entityType: "occasion_survey_invite",
    entityId: invite.inviteId,
    after: { occasionId: invite.occasionId },
  });
}

/** La persona responde su invitación: valida contra los campos y guarda sin persona. */
export async function answerSurveyAs(
  actor: Actor & { personId: string },
  token: string,
  raw: Record<string, unknown>,
  now = new Date(),
): Promise<AnswerSurveyResult> {
  const invite = await getSurveyInviteForActor(actor.personId, token, now);
  if (invite.state !== "OPEN") {
    return { ok: false, state: invite.state };
  }
  const validated = validateAnswers(invite.fields, raw);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors };
  }
  await runCommand(actor, (ctx) => answerSurvey(ctx, invite, validated.answers, now));
  return { ok: true };
}

export interface OccasionSurveySummary extends SurveySummary {
  invited: number;
  formTitle: string;
}

/** Agregado anónimo de una ocasión; null si no tiene encuesta. */
export async function surveySummary(occasionId: string): Promise<OccasionSurveySummary | null> {
  const db = getDb();
  const [row] = await db
    .select({ surveyFormId: occasion.surveyFormId })
    .from(occasion)
    .where(eq(occasion.id, occasionId))
    .limit(1);
  if (!row?.surveyFormId) {
    return null;
  }
  const form = await getForm(row.surveyFormId);
  if (!form) {
    return null;
  }
  const [[invited], responses] = await Promise.all([
    db
      .select({ n: count() })
      .from(occasionSurveyInvite)
      .where(eq(occasionSurveyInvite.occasionId, occasionId)),
    db
      .select({ answers: occasionSurveyResponse.answers })
      .from(occasionSurveyResponse)
      .where(eq(occasionSurveyResponse.occasionId, occasionId)),
  ]);
  const summary = summarizeAnswers(
    parseFields(form.fields),
    responses.map((item) => item.answers),
  );
  return { ...summary, invited: invited?.n ?? 0, formTitle: form.title };
}

export interface CommitteeSurveyRow {
  occasionId: string;
  title: string;
  startsAt: Date;
  invited: number;
  answered: number;
  /** Promedio de la primera calificación del formulario, si la tiene. */
  average: number | null;
}

export interface CommitteeSurveys {
  rows: CommitteeSurveyRow[];
  answered: number;
  average: number | null;
}

/** Las encuestas de las ocasiones cerradas de un comité en el término, para la vista del líder. */
export async function surveySummaryForCommittee(
  termId: string,
  committeeId: string,
): Promise<CommitteeSurveys> {
  const db = getDb();
  const occasions = await db
    .select()
    .from(occasion)
    .where(
      and(
        eq(occasion.termId, termId),
        eq(occasion.committeeId, committeeId),
        eq(occasion.status, "CLOSED"),
        isNotNull(occasion.surveyFormId),
      ),
    )
    .orderBy(asc(occasion.startsAt));
  if (occasions.length === 0) {
    return { rows: [], answered: 0, average: null };
  }
  const ids = occasions.map((row) => row.id);
  const [invites, responses] = await Promise.all([
    db
      .select({ occasionId: occasionSurveyInvite.occasionId, n: count() })
      .from(occasionSurveyInvite)
      .where(inArray(occasionSurveyInvite.occasionId, ids))
      .groupBy(occasionSurveyInvite.occasionId),
    db
      .select({
        occasionId: occasionSurveyResponse.occasionId,
        answers: occasionSurveyResponse.answers,
      })
      .from(occasionSurveyResponse)
      .where(inArray(occasionSurveyResponse.occasionId, ids)),
  ]);
  const forms = new Map<string, FormField[]>();
  for (const formId of new Set(occasions.map((row) => row.surveyFormId ?? ""))) {
    const form = formId ? await getForm(formId) : null;
    forms.set(formId, form ? parseFields(form.fields) : []);
  }
  let totalAnswered = 0;
  let weighted = 0;
  let weightedCount = 0;
  const rows = occasions.map((row) => {
    const fields = forms.get(row.surveyFormId ?? "") ?? [];
    const own = responses.filter((item) => item.occasionId === row.id).map((item) => item.answers);
    const summary = summarizeAnswers(fields, own);
    const rating = summary.questions.find((question) => question.type === "RATING");
    const ratingAnswers = rating
      ? rating.distribution.reduce((sum, item) => sum + item.count, 0)
      : 0;
    if (rating?.average !== null && rating?.average !== undefined) {
      weighted += rating.average * ratingAnswers;
      weightedCount += ratingAnswers;
    }
    totalAnswered += own.length;
    return {
      occasionId: row.id,
      title: row.title,
      startsAt: row.startsAt,
      invited: invites.find((item) => item.occasionId === row.id)?.n ?? 0,
      answered: own.length,
      average: rating?.average ?? null,
    };
  });
  return {
    rows,
    answered: totalAnswered,
    average: weightedCount > 0 ? Math.round((weighted / weightedCount) * 100) / 100 : null,
  };
}

/** Al salir de la OE o anonimizarse: las invitaciones no son historia; las respuestas no la nombran. */
export async function deleteSurveyInvitesFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(occasionSurveyInvite)
    .where(eq(occasionSurveyInvite.personId, personId))
    .returning({ id: occasionSurveyInvite.id });
  return rows.length;
}
