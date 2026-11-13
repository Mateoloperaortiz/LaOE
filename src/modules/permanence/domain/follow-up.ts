import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { currentSeatAuthority, getMembershipRef } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  capCompanion,
  followUpEntry,
  followUpTemplate,
  workGroup,
  workGroupMembership,
} from "../schema";
import { FOLLOW_UP_KINDS, type FollowUpKind } from "./follow-up-pure";

// La bitácora de la Presidencia (ADR-197 reglas 4 y 5). En el CAP, cada comité del semestre tiene un
// acompañante, que guarda el plan del mes y una nota por reunión; las leen la Presidencia y el CAP. Las
// preguntas salen de plantillas que la Presidencia edita sin código; sin plantilla guardada, valen las
// del catálogo de textos. Cada entrada guarda las preguntas como estaban al escribirla.

export type FollowUpEntryRow = typeof followUpEntry.$inferSelect;

/** Las preguntas de fábrica de cada formato, del catálogo de textos (hoja de la Presidencia 2027). */
const DEFAULT_QUESTIONS: Record<FollowUpKind, Parameters<typeof tList>[0]> = {
  CAP_PLAN: "T-5124",
  CAP_MEETING: "T-5125",
  EDITION_PLAN: "T-5126",
  EDITION_MEETING: "T-5127",
  EDITION_HANDOVER: "T-5128",
};

const guard = (index: number) => tList("T-5129")[index] ?? "";

/** Las preguntas vigentes de un formato; con `roleCode`, las generales más las propias del cargo. */
export async function templateQuestions(
  kind: FollowUpKind,
  roleCode: string | null = null,
  exec: Executor = getDb(),
): Promise<string[]> {
  const rows = await exec
    .select()
    .from(followUpTemplate)
    .where(
      and(
        eq(followUpTemplate.kind, kind),
        roleCode ? undefined : isNull(followUpTemplate.roleCode),
      ),
    );
  const general =
    rows.find((row) => row.roleCode === null)?.questions ?? tList(DEFAULT_QUESTIONS[kind]);
  const own = roleCode ? (rows.find((row) => row.roleCode === roleCode)?.questions ?? []) : [];
  return [...general, ...own];
}

/** Si la persona está en el CAP del semestre (el grupo de trabajo de código CAP). */
export async function isCapMember(
  personId: string,
  termId: string,
  exec: Executor = getDb(),
): Promise<boolean> {
  const member = await getMembershipRef(personId, exec);
  if (!member || !["ACTIVE", "HONORARY"].includes(member.status)) return false;
  const [row] = await exec
    .select({ id: workGroupMembership.id })
    .from(workGroupMembership)
    .innerJoin(workGroup, eq(workGroup.id, workGroupMembership.groupId))
    .where(
      and(
        eq(workGroupMembership.personId, personId),
        eq(workGroup.termId, termId),
        eq(workGroup.kind, "WORK_COMMITTEE"),
        eq(workGroup.code, "CAP"),
        isNull(workGroupMembership.leftAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function isPresidency(ctx: CommandContext): Promise<boolean> {
  return (
    ctx.actor.personId !== null &&
    (await currentSeatAuthority(ctx.actor.personId, "PRESIDENT", ctx.tx)) === "HOLDER"
  );
}

async function currentTermId(): Promise<string> {
  const term = await getCurrentTerm();
  if (!term) throw new DomainError(t("T-032"));
  return term.id;
}

// --- Plantillas ---

export const templateInputSchema = z.object({
  kind: z.enum(FOLLOW_UP_KINDS),
  roleCode: z.string().trim().min(1).max(60).nullable().default(null),
  questions: z.array(z.string().trim().min(2).max(300)).min(1).max(30),
});

export type TemplateInput = z.input<typeof templateInputSchema>;

/** La Presidencia cambia las preguntas de un formato (ADR-197 regla 4). */
export async function saveTemplate(ctx: CommandContext, raw: TemplateInput): Promise<void> {
  const input = templateInputSchema.parse(raw);
  if (!(await isPresidency(ctx))) throw new DomainError(guard(0));
  const [before] = await ctx.tx
    .select()
    .from(followUpTemplate)
    .where(
      and(
        eq(followUpTemplate.kind, input.kind),
        input.roleCode
          ? eq(followUpTemplate.roleCode, input.roleCode)
          : isNull(followUpTemplate.roleCode),
      ),
    );
  if (before) {
    await ctx.tx
      .update(followUpTemplate)
      .set({ questions: input.questions, updatedById: ctx.actor.personId })
      .where(eq(followUpTemplate.id, before.id));
  } else {
    await ctx.tx.insert(followUpTemplate).values({ ...input, updatedById: ctx.actor.personId });
  }
  await ctx.audit({
    action: "follow-up.template-saved",
    entityType: "follow_up_template",
    entityId: before?.id ?? input.kind,
    before: before ? { questions: before.questions } : undefined,
    after: { kind: input.kind, roleCode: input.roleCode, questions: input.questions },
  });
}

// --- Acompañantes del CAP ---

/** La Presidencia asigna o quita el acompañante de un comité en el semestre (ADR-197 regla 4). */
export async function assignCompanion(
  ctx: CommandContext,
  committeeId: string,
  personId: string | null,
): Promise<void> {
  if (!(await isPresidency(ctx))) throw new DomainError(guard(0));
  const termId = await currentTermId();
  if (personId && !(await isCapMember(personId, termId, ctx.tx))) {
    throw new DomainError(guard(1), "personId");
  }
  const [before] = await ctx.tx
    .select()
    .from(capCompanion)
    .where(and(eq(capCompanion.termId, termId), eq(capCompanion.committeeId, committeeId)));
  if (before) await ctx.tx.delete(capCompanion).where(eq(capCompanion.id, before.id));
  if (personId) {
    await ctx.tx
      .insert(capCompanion)
      .values({ termId, committeeId, personId, assignedById: ctx.actor.personId });
  }
  await ctx.audit({
    action: "follow-up.companion-assigned",
    entityType: "committee",
    entityId: committeeId,
    before: { personId: before?.personId ?? null },
    after: { personId },
  });
}

/** Quienes están en el CAP del semestre, para elegir acompañante. */
export async function listCapMembers(termId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ personId: workGroupMembership.personId })
    .from(workGroupMembership)
    .innerJoin(workGroup, eq(workGroup.id, workGroupMembership.groupId))
    .where(
      and(
        eq(workGroup.termId, termId),
        eq(workGroup.kind, "WORK_COMMITTEE"),
        eq(workGroup.code, "CAP"),
        isNull(workGroupMembership.leftAt),
      ),
    );
  return rows.map((row) => row.personId);
}

export async function listCompanions(termId: string): Promise<Map<string, string>> {
  const rows = await getDb().select().from(capCompanion).where(eq(capCompanion.termId, termId));
  return new Map(rows.map((row) => [row.committeeId, row.personId]));
}

// --- La bitácora del comité ---

const answersSchema = z.array(z.string().trim().max(4000)).max(30);

export const capEntryInputSchema = z.object({
  committeeId: z.string().trim().min(1),
  kind: z.enum(["CAP_PLAN", "CAP_MEETING"]),
  /** El mes del plan o el día de la reunión. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  occurredOn: z.iso.date().optional(),
  answers: answersSchema,
});

export type CapEntryInput = z.input<typeof capEntryInputSchema>;

/** Escribe en la bitácora del comité su acompañante o la Presidencia. */
async function assertWritesFor(ctx: CommandContext, committeeId: string, termId: string) {
  if (await isPresidency(ctx)) return;
  const [companion] = await ctx.tx
    .select()
    .from(capCompanion)
    .where(and(eq(capCompanion.termId, termId), eq(capCompanion.committeeId, committeeId)));
  if (!companion || companion.personId !== ctx.actor.personId) {
    throw new DomainError(guard(2));
  }
}

/**
 * El plan del mes (uno por comité y mes: guardarlo otra vez lo reemplaza) o una nota de reunión. Las
 * respuestas vacías se guardan vacías; al menos una tiene que decir algo.
 */
export async function saveCapEntry(
  ctx: CommandContext,
  raw: CapEntryInput,
  now = new Date(),
): Promise<{ id: string }> {
  const input = capEntryInputSchema.parse(raw);
  const termId = await currentTermId();
  await assertWritesFor(ctx, input.committeeId, termId);
  if (!input.answers.some((answer) => answer.length > 0)) throw new DomainError(guard(3));
  const questions = await templateQuestions(input.kind, null, ctx.tx);
  const answers = questions.map((question, index) => ({
    question,
    answer: input.answers[index] ?? "",
  }));
  const today = todayKey(now);
  if (input.kind === "CAP_PLAN") {
    const month = input.month ?? today.slice(0, 7);
    const [before] = await ctx.tx
      .select()
      .from(followUpEntry)
      .where(
        and(
          eq(followUpEntry.kind, "CAP_PLAN"),
          eq(followUpEntry.committeeId, input.committeeId),
          eq(followUpEntry.month, month),
        ),
      );
    if (before) {
      await ctx.tx
        .update(followUpEntry)
        .set({ answers, authorId: ctx.actor.personId })
        .where(eq(followUpEntry.id, before.id));
      await ctx.audit({
        action: "follow-up.entry-updated",
        entityType: "follow_up_entry",
        entityId: before.id,
        before: { answers: before.answers },
        after: { answers },
      });
      return { id: before.id };
    }
    return insertEntry(ctx, {
      kind: "CAP_PLAN",
      termId,
      committeeId: input.committeeId,
      month,
      occurredOn: `${month}-01`,
      answers,
    });
  }
  return insertEntry(ctx, {
    kind: "CAP_MEETING",
    termId,
    committeeId: input.committeeId,
    occurredOn: input.occurredOn ?? today,
    answers,
  });
}

async function insertEntry(
  ctx: CommandContext,
  values: typeof followUpEntry.$inferInsert,
): Promise<{ id: string }> {
  const [row] = await ctx.tx
    .insert(followUpEntry)
    .values({ ...values, authorId: ctx.actor.personId })
    .returning({ id: followUpEntry.id });
  if (!row) throw new Error("No se pudo guardar la bitácora");
  await ctx.audit({
    action: "follow-up.entry-created",
    entityType: "follow_up_entry",
    entityId: row.id,
    after: values,
  });
  return row;
}

export async function listCommitteeLog(committeeId: string): Promise<FollowUpEntryRow[]> {
  return getDb()
    .select()
    .from(followUpEntry)
    .where(
      and(
        eq(followUpEntry.committeeId, committeeId),
        inArray(followUpEntry.kind, ["CAP_PLAN", "CAP_MEETING"]),
      ),
    )
    .orderBy(desc(followUpEntry.occurredOn), desc(followUpEntry.createdAt));
}

// Comandos (ADR-003).

export function saveTemplateAs(actor: Actor, input: TemplateInput): Promise<void> {
  return runCommand(actor, (ctx) => saveTemplate(ctx, input));
}

export function assignCompanionAs(
  actor: Actor,
  committeeId: string,
  personId: string | null,
): Promise<void> {
  return runCommand(actor, (ctx) => assignCompanion(ctx, committeeId, personId));
}

export function saveCapEntryAs(actor: Actor, input: CapEntryInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => saveCapEntry(ctx, input));
}
