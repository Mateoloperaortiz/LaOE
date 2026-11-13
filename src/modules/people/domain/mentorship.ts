import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { committee, committeeMembership, membership, mentorship, person } from "../schema";
import { canParticipate, signInAccess } from "./access-pure";

// Padrinos (ADR-185): un nuevo del semestre tiene a lo sumo un padrino, que es un veterano que
// participa o un egresado con acceso (ADR-184). Lo asigna ADMIN desde la Operación; cada uno ve al otro
// por su nombre en Mi OE, y los dos reciben el aviso. Un padrino acompaña a lo sumo a tres por semestre.

export const MENTEES_PER_MENTOR = 3;

export const mentorshipInputSchema = z.object({
  menteeId: z.string().trim().min(1),
  mentorId: z.string().trim().min(1),
});

export type MentorshipInput = z.infer<typeof mentorshipInputSchema>;

export interface MentorshipRow {
  id: string;
  termId: string;
  termCode: string;
  menteeId: string;
  menteeName: string;
  mentorId: string;
  mentorName: string;
  createdAt: Date;
}

type Standing = {
  status: (typeof membership.$inferSelect)["status"];
  endReason: string | null;
  firstTermId: string;
  anonymizedAt: Date | null;
};

async function standingOf(exec: Executor, personId: string): Promise<Standing | null> {
  const [row] = await exec
    .select({
      status: membership.status,
      endReason: membership.endReason,
      firstTermId: membership.firstTermId,
      anonymizedAt: person.anonymizedAt,
    })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(eq(membership.personId, personId));
  return row ?? null;
}

/** Un nuevo del semestre: activo y con ese semestre como el de ingreso. */
function isNewcomer(standing: Standing | null, termId: string): boolean {
  return standing?.status === "ACTIVE" && standing.firstTermId === termId && !standing.anonymizedAt;
}

/** Un veterano que participa o un egresado con acceso (ADR-184). */
function canMentor(standing: Standing | null, termId: string): boolean {
  if (!standing) return false;
  const access = signInAccess(standing);
  if (access === "ALUMNI") return true;
  return canParticipate(standing.status) && standing.firstTermId !== termId;
}

async function requireTermId(): Promise<string> {
  const current = await getCurrentTerm();
  if (!current) throw new DomainError(t("T-5013"));
  return current.id;
}

async function displayName(exec: Executor, personId: string): Promise<string> {
  const [row] = await exec
    .select({ preferred: person.preferredName, first: person.firstName })
    .from(person)
    .where(eq(person.id, personId));
  return row?.preferred ?? row?.first ?? "";
}

/**
 * Asigna o cambia el padrino de un nuevo del semestre en curso. El candado por padrino cuida el tope
 * de tres: dos asignaciones a la vez al mismo padrino no pasan las dos.
 */
export async function assignMentor(
  ctx: CommandContext,
  input: MentorshipInput,
): Promise<{ id: string }> {
  const termId = await requireTermId();
  if (input.menteeId === input.mentorId) throw new DomainError(t("T-5011"));
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`mentorship:${input.mentorId}`}))`,
  );
  if (!isNewcomer(await standingOf(ctx.tx, input.menteeId), termId)) {
    throw new DomainError(t("T-5010"));
  }
  if (!canMentor(await standingOf(ctx.tx, input.mentorId), termId)) {
    throw new DomainError(t("T-5011"));
  }
  const [taken] = await ctx.tx
    .select({ n: count() })
    .from(mentorship)
    .where(
      and(
        eq(mentorship.termId, termId),
        eq(mentorship.mentorId, input.mentorId),
        ne(mentorship.menteeId, input.menteeId),
      ),
    );
  if ((taken?.n ?? 0) >= MENTEES_PER_MENTOR) {
    throw new DomainError(t("T-5012", { n: MENTEES_PER_MENTOR }));
  }
  const [previous] = await ctx.tx
    .select({ id: mentorship.id, mentorId: mentorship.mentorId })
    .from(mentorship)
    .where(and(eq(mentorship.termId, termId), eq(mentorship.menteeId, input.menteeId)));
  if (previous?.mentorId === input.mentorId) return { id: previous.id };
  const [row] = await ctx.tx
    .insert(mentorship)
    .values({
      termId,
      menteeId: input.menteeId,
      mentorId: input.mentorId,
      assignedById: ctx.actor.personId,
    })
    .onConflictDoUpdate({
      target: [mentorship.termId, mentorship.menteeId],
      set: { mentorId: input.mentorId, assignedById: ctx.actor.personId, updatedAt: new Date() },
    })
    .returning({ id: mentorship.id });
  if (!row) throw new Error("No se pudo asignar el padrino");
  await ctx.audit({
    action: previous ? "mentorship.changed" : "mentorship.assigned",
    entityType: "mentorship",
    entityId: row.id,
    before: previous ? { mentorId: previous.mentorId } : null,
    after: { termId, menteeId: input.menteeId, mentorId: input.mentorId },
  });
  const [menteeName, mentorName] = await Promise.all([
    displayName(ctx.tx, input.menteeId),
    displayName(ctx.tx, input.mentorId),
  ]);
  const [menteeTitle, menteeBody] = tList("T-5014");
  const [mentorTitle, mentorBody] = tList("T-5015");
  const notices = [
    {
      personId: input.menteeId,
      title: menteeTitle ?? "",
      body: (menteeBody ?? "").replace("{nombre}", mentorName),
    },
    {
      personId: input.mentorId,
      title: mentorTitle ?? "",
      body: (mentorBody ?? "").replace("{nombre}", menteeName),
    },
  ];
  for (const notice of notices) {
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "ANNOUNCEMENT",
        recipients: [{ personId: notice.personId, url: "/app/padrinos" }],
        title: notice.title,
        body: notice.body,
        url: "/app/padrinos",
        tag: `padrino-${row.id}`,
        dedupeKey: `padrino:${row.id}:${input.mentorId}:${notice.personId}`,
      }),
    );
  }
  return { id: row.id };
}

export function assignMentorAs(actor: Actor, input: MentorshipInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => assignMentor(ctx, input));
}

/** Cambia el padrino de una relación existente: el nuevo sigue siendo el mismo. */
export async function reassignMentor(
  ctx: CommandContext,
  id: string,
  input: MentorshipInput,
): Promise<void> {
  const [row] = await ctx.tx
    .select({ menteeId: mentorship.menteeId })
    .from(mentorship)
    .where(eq(mentorship.id, id));
  if (!row) throw new DomainError(t("T-5010"));
  await assignMentor(ctx, { menteeId: row.menteeId, mentorId: input.mentorId });
}

/** Quita la relación: el nuevo queda sin padrino. */
export async function removeMentorship(ctx: CommandContext, id: string): Promise<void> {
  const [row] = await ctx.tx.delete(mentorship).where(eq(mentorship.id, id)).returning();
  if (!row) return;
  await ctx.audit({
    action: "mentorship.removed",
    entityType: "mentorship",
    entityId: id,
    before: { termId: row.termId, menteeId: row.menteeId, mentorId: row.mentorId },
  });
}

const mentee = alias(person, "mentee");
const mentor = alias(person, "mentor");

function rowsQuery() {
  return getDb()
    .select({
      id: mentorship.id,
      termId: mentorship.termId,
      menteeId: mentorship.menteeId,
      menteeName: mentee.fullName,
      mentorId: mentorship.mentorId,
      mentorName: mentor.fullName,
      createdAt: mentorship.createdAt,
    })
    .from(mentorship)
    .innerJoin(mentee, eq(mentee.id, mentorship.menteeId))
    .innerJoin(mentor, eq(mentor.id, mentorship.mentorId));
}

/** El código del semestre de cada fila, leído de `terms` por su API. */
async function withTermCodes(
  rows: (Omit<MentorshipRow, "termCode" | "menteeName" | "mentorName"> & {
    menteeName: string | null;
    mentorName: string | null;
  })[],
): Promise<MentorshipRow[]> {
  const codes = new Map((await listAllTerms()).map((item) => [item.id, item.code]));
  return rows.map((row) => ({
    ...row,
    menteeName: row.menteeName ?? "",
    mentorName: row.mentorName ?? "",
    termCode: codes.get(row.termId) ?? "",
  }));
}

export async function listMentorships(params: {
  page: number;
  pageSize: number;
}): Promise<{ rows: MentorshipRow[]; total: number }> {
  const [rows, [total]] = await Promise.all([
    rowsQuery()
      .orderBy(desc(mentorship.createdAt), asc(mentee.fullName), asc(mentorship.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    getDb().select({ n: count() }).from(mentorship),
  ]);
  return { rows: await withTermCodes(rows), total: total?.n ?? 0 };
}

export async function getMentorship(id: string): Promise<MentorshipRow | null> {
  const [row] = await rowsQuery().where(eq(mentorship.id, id));
  return row ? ((await withTermCodes([row]))[0] ?? null) : null;
}

/** Las opciones del formulario: los nuevos del semestre en curso y quienes pueden ser padrinos. */
export async function listMentorshipOptions(): Promise<{
  mentees: { value: string; label: string }[];
  mentors: { value: string; label: string }[];
}> {
  const current = await getCurrentTerm();
  if (!current) return { mentees: [], mentors: [] };
  const rows = await getDb()
    .select({
      id: person.id,
      name: person.fullName,
      status: membership.status,
      endReason: membership.endReason,
      firstTermId: membership.firstTermId,
      anonymizedAt: person.anonymizedAt,
    })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(
      and(
        isNull(person.anonymizedAt),
        or(
          inArray(membership.status, ["ACTIVE", "HONORARY"]),
          eq(membership.endReason, "GRADUATION"),
        ),
      ),
    )
    .orderBy(asc(person.fullName), asc(person.id));
  const [, , , , egresado] = tList("T-5016");
  const mentees = rows
    .filter((row) => isNewcomer(row, current.id))
    .map((row) => ({ value: row.id, label: row.name ?? "" }));
  const mentors = rows
    .filter((row) => canMentor(row, current.id))
    .map((row) => ({
      value: row.id,
      label:
        signInAccess(row) === "ALUMNI" ? `${row.name ?? ""} · ${egresado ?? ""}` : (row.name ?? ""),
    }));
  return { mentees, mentors };
}

export interface MentorshipPerson {
  personId: string;
  name: string;
  alumni: boolean;
  committees: string[];
}

async function peopleViews(personIds: string[], termId: string): Promise<MentorshipPerson[]> {
  if (personIds.length === 0) return [];
  const db = getDb();
  const [people, committees] = await Promise.all([
    db
      .select({
        id: person.id,
        preferred: person.preferredName,
        fullName: person.fullName,
        status: membership.status,
        endReason: membership.endReason,
        anonymizedAt: person.anonymizedAt,
      })
      .from(person)
      .innerJoin(membership, eq(membership.personId, person.id))
      .where(inArray(person.id, personIds)),
    db
      .select({ personId: committeeMembership.personId, name: committee.name })
      .from(committeeMembership)
      .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
      .where(
        and(
          inArray(committeeMembership.personId, personIds),
          eq(committeeMembership.termId, termId),
          isNull(committeeMembership.leftAt),
        ),
      )
      .orderBy(asc(committee.name)),
  ]);
  return personIds.flatMap((id) => {
    const row = people.find((item) => item.id === id);
    if (!row) return [];
    return [
      {
        personId: id,
        name: row.fullName ?? "",
        alumni: signInAccess(row) === "ALUMNI",
        committees: committees.filter((item) => item.personId === id).map((item) => item.name),
      },
    ];
  });
}

/** Lo que ve una persona en Mi OE este semestre: su padrino, si tiene, y sus ahijados. */
export async function mentorshipsFor(
  personId: string,
): Promise<{ mentor: MentorshipPerson | null; mentees: MentorshipPerson[] }> {
  const current = await getCurrentTerm();
  if (!current) return { mentor: null, mentees: [] };
  const rows = await getDb()
    .select({ menteeId: mentorship.menteeId, mentorId: mentorship.mentorId })
    .from(mentorship)
    .where(
      and(
        eq(mentorship.termId, current.id),
        or(eq(mentorship.menteeId, personId), eq(mentorship.mentorId, personId)),
      ),
    );
  const mentorId = rows.find((row) => row.menteeId === personId)?.mentorId;
  const menteeIds = rows.filter((row) => row.mentorId === personId).map((row) => row.menteeId);
  const [mentorView, menteeViews] = await Promise.all([
    peopleViews(mentorId ? [mentorId] : [], current.id),
    peopleViews(menteeIds, current.id),
  ]);
  return {
    mentor: mentorView[0] ?? null,
    mentees: menteeViews.sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
