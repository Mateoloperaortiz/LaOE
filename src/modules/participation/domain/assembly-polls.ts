import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { canParticipate, getMembershipRef } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { assemblyPoll, assemblyTally, assemblyVoter, checkIn, occasion } from "../schema";

// El modo asamblea (ADR-180): consultas dentro de una asamblea. Vota quien tiene la asistencia aprobada
// en esa asamblea y puede participar, una vez por consulta. En una secreta, el padrón no guarda la opción
// y los votos solo se suman: nada une a la persona con lo que eligió, y los resultados salen al cerrar.

export const ASSEMBLY_POLL_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type AssemblyPollStatus = (typeof ASSEMBLY_POLL_STATUSES)[number];
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 8;

export interface PollView {
  id: string;
  occasionId: string;
  question: string;
  options: string[];
  secret: boolean;
  status: AssemblyPollStatus;
  voters: number;
  /** Cada opción con sus votos, o `null` si es secreta y sigue abierta. */
  results: Array<{ option: string; votes: number }> | null;
}

async function tallies(pollIds: string[]): Promise<Map<string, Map<number, number>>> {
  if (pollIds.length === 0) return new Map();
  const rows = await getDb()
    .select()
    .from(assemblyTally)
    .where(inArray(assemblyTally.pollId, pollIds));
  const byPoll = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const map = byPoll.get(row.pollId) ?? new Map<number, number>();
    map.set(row.optionIndex, row.votes);
    byPoll.set(row.pollId, map);
  }
  return byPoll;
}

/** Las consultas de una asamblea con sus resultados; las secretas abiertas, sin resultados. */
export async function listPolls(occasionId: string): Promise<PollView[]> {
  const polls = await getDb()
    .select()
    .from(assemblyPoll)
    .where(eq(assemblyPoll.occasionId, occasionId))
    .orderBy(asc(assemblyPoll.createdAt));
  const counts = await tallies(polls.map((poll) => poll.id));
  return polls.map((poll) => {
    const tally = counts.get(poll.id) ?? new Map<number, number>();
    const results = poll.options.map((option, index) => ({
      option,
      votes: tally.get(index) ?? 0,
    }));
    return {
      id: poll.id,
      occasionId: poll.occasionId,
      question: poll.question,
      options: poll.options,
      secret: poll.secret,
      status: poll.status,
      voters: results.reduce((sum, item) => sum + item.votes, 0),
      results: poll.secret && poll.status !== "CLOSED" ? null : results,
    };
  });
}

async function createPoll(
  ctx: CommandContext,
  input: { occasionId: string; question: string; options: string[]; secret: boolean },
): Promise<{ id: string }> {
  const question = input.question.trim();
  const options = input.options.map((option) => option.trim()).filter(Boolean);
  if (question.length < 3) throw new DomainError(t("T-4993"), "question");
  if (options.length < POLL_OPTIONS_MIN || options.length > POLL_OPTIONS_MAX) {
    throw new DomainError(t("T-4994", { min: POLL_OPTIONS_MIN, max: POLL_OPTIONS_MAX }), "options");
  }
  const [assembly] = await ctx.tx
    .select({ kind: occasion.kind })
    .from(occasion)
    .where(eq(occasion.id, input.occasionId));
  if (assembly?.kind !== "ASSEMBLY") throw new DomainError(t("T-032"));
  const [row] = await ctx.tx
    .insert(assemblyPoll)
    .values({ occasionId: input.occasionId, question, options, secret: input.secret })
    .returning({ id: assemblyPoll.id });
  if (!row) throw new Error("No se pudo crear la consulta");
  await ctx.audit({
    action: "assembly-poll.created",
    entityType: "assembly_poll",
    entityId: row.id,
    after: { question, options, secret: input.secret },
  });
  return row;
}

async function setStatus(
  ctx: CommandContext,
  pollId: string,
  from: AssemblyPollStatus,
  to: AssemblyPollStatus,
): Promise<void> {
  try {
    const [row] = await ctx.tx
      .update(assemblyPoll)
      .set({
        status: to,
        ...(to === "OPEN" ? { openedAt: new Date() } : { closedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(and(eq(assemblyPoll.id, pollId), eq(assemblyPoll.status, from)))
      .returning({ id: assemblyPoll.id });
    if (!row) throw new DomainError(t("T-4997"));
  } catch (error) {
    if (isUniqueViolation(error, "assembly_poll_one_open_unique")) {
      throw new DomainError(t("T-4998"));
    }
    throw error;
  }
  await ctx.audit({
    action: to === "OPEN" ? "assembly-poll.opened" : "assembly-poll.closed",
    entityType: "assembly_poll",
    entityId: pollId,
  });
}

function openPoll(ctx: CommandContext, pollId: string): Promise<void> {
  return setStatus(ctx, pollId, "DRAFT", "OPEN");
}

function closePoll(ctx: CommandContext, pollId: string): Promise<void> {
  return setStatus(ctx, pollId, "OPEN", "CLOSED");
}

/** La asamblea de una consulta: para que la Operación compruebe el permiso de operarla. */
export async function pollOccasionId(pollId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ occasionId: assemblyPoll.occasionId })
    .from(assemblyPoll)
    .where(eq(assemblyPoll.id, pollId));
  return row?.occasionId ?? null;
}

/** Si la persona puede votar en esta asamblea: asistencia aprobada y puede participar. */
async function isPresent(personId: string, occasionId: string): Promise<boolean> {
  const [present] = await getDb()
    .select({ id: checkIn.id })
    .from(checkIn)
    .where(
      and(
        eq(checkIn.occasionId, occasionId),
        eq(checkIn.personId, personId),
        eq(checkIn.status, "APPROVED"),
      ),
    )
    .limit(1);
  if (!present) return false;
  return canParticipate((await getMembershipRef(personId))?.status);
}

/** Votar en una consulta abierta (ADR-180 reglas 2 y 3). */
export function votePollAs(actor: Actor, pollId: string, optionIndex: number): Promise<void> {
  return runCommand(actor, async (ctx) => {
    const personId = ctx.actor.personId;
    if (!personId) throw new DomainError(t("T-032"));
    const [poll] = await ctx.tx
      .select()
      .from(assemblyPoll)
      .where(eq(assemblyPoll.id, pollId))
      .for("update");
    if (!poll || poll.status !== "OPEN") throw new DomainError(t("T-4997"));
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
      throw new DomainError(t("T-032"));
    }
    if (!(await isPresent(personId, poll.occasionId))) throw new DomainError(t("T-4995"));
    const inserted = await ctx.tx
      .insert(assemblyVoter)
      .values({ pollId, personId, optionIndex: poll.secret ? null : optionIndex })
      .onConflictDoNothing()
      .returning({ pollId: assemblyVoter.pollId });
    if (inserted.length === 0) throw new DomainError(t("T-4996"));
    await ctx.tx
      .insert(assemblyTally)
      .values({ pollId, optionIndex, votes: 1 })
      .onConflictDoUpdate({
        target: [assemblyTally.pollId, assemblyTally.optionIndex],
        set: { votes: sql`${assemblyTally.votes} + 1` },
      });
    // La auditoría dice que la persona votó, nunca qué (ADR-180).
    await ctx.audit({
      action: "assembly-poll.voted",
      entityType: "assembly_poll",
      entityId: pollId,
      after: poll.secret ? {} : { optionIndex },
    });
  });
}

export interface MemberPollView extends PollView {
  voted: boolean;
}

/** Lo que ve un miembro en su asamblea: las consultas abiertas y cerradas, y si ya votó. */
export async function listPollsForMember(
  personId: string,
  occasionId: string,
): Promise<{ present: boolean; polls: MemberPollView[] }> {
  const [present, polls] = await Promise.all([
    isPresent(personId, occasionId),
    listPolls(occasionId),
  ]);
  const visible = polls.filter((poll) => poll.status !== "DRAFT");
  const voted =
    visible.length > 0
      ? await getDb()
          .select({ pollId: assemblyVoter.pollId })
          .from(assemblyVoter)
          .where(
            and(
              eq(assemblyVoter.personId, personId),
              inArray(
                assemblyVoter.pollId,
                visible.map((poll) => poll.id),
              ),
            ),
          )
      : [];
  const votedIds = new Set(voted.map((row) => row.pollId));
  return { present, polls: visible.map((poll) => ({ ...poll, voted: votedIds.has(poll.id) })) };
}

/** Las asambleas con una consulta abierta donde la persona está presente y no ha votado («Te toca»). */
export async function listPendingVotes(
  personId: string,
): Promise<Array<{ occasionId: string; occasionTitle: string }>> {
  const rows = await getDb()
    .select({ pollId: assemblyPoll.id, occasionId: occasion.id, occasionTitle: occasion.title })
    .from(assemblyPoll)
    .innerJoin(occasion, eq(occasion.id, assemblyPoll.occasionId))
    .innerJoin(
      checkIn,
      and(
        eq(checkIn.occasionId, occasion.id),
        eq(checkIn.personId, personId),
        eq(checkIn.status, "APPROVED"),
      ),
    )
    .leftJoin(
      assemblyVoter,
      and(eq(assemblyVoter.pollId, assemblyPoll.id), eq(assemblyVoter.personId, personId)),
    )
    .where(and(eq(assemblyPoll.status, "OPEN"), sql`${assemblyVoter.personId} is null`));
  const seen = new Set<string>();
  return rows
    .filter((row) => (seen.has(row.occasionId) ? false : seen.add(row.occasionId)))
    .map((row) => ({ occasionId: row.occasionId, occasionTitle: row.occasionTitle }));
}

/** Crear, abrir y cerrar desde la Operación, con el actor del request (ADR-082 regla 2). */
export function createPollAs(
  actor: Actor,
  input: { occasionId: string; question: string; options: string[]; secret: boolean },
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createPoll(ctx, input));
}

export function setPollStatusAs(
  actor: Actor,
  pollId: string,
  to: "OPEN" | "CLOSED",
): Promise<void> {
  return runCommand(actor, (ctx) =>
    to === "OPEN" ? openPoll(ctx, pollId) : closePoll(ctx, pollId),
  );
}
