import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { listEditionRefs, listEditionsBetween, previousEditionOf } from "@/modules/events";
import {
  currentSeatAuthority,
  isMacroeventDirector,
  listMacroeventBoard,
  listMyMacroeventSeats,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { editionFollowUp, followUpEntry } from "../schema";
import { type FollowUpEntryRow, templateQuestions } from "./follow-up";

// El seguimiento de un macroevento (ADR-197 regla 5): la Presidencia guarda el plan del mes con las
// direcciones generales y las reuniones con Desarrollo Estudiantil, atados a la edición. Cada cargo de
// la mesa entrega su empalme, con las preguntas generales y las propias del cargo. El seguimiento de la
// edición no se cierra sin todos los empalmes, y la mesa de la edición siguiente los encuentra
// (Regl. art. 66).

const guard = (index: number) => tList("T-5136")[index] ?? "";

async function assertPresidency(ctx: CommandContext) {
  const ok =
    ctx.actor.personId !== null &&
    (await currentSeatAuthority(ctx.actor.personId, "PRESIDENT", ctx.tx)) === "HOLDER";
  if (!ok) throw new DomainError(tList("T-5129")[0] ?? "");
}

async function assertOpen(ctx: CommandContext, editionId: string) {
  const [closed] = await ctx.tx
    .select()
    .from(editionFollowUp)
    .where(eq(editionFollowUp.editionId, editionId));
  if (closed) throw new DomainError(guard(0));
}

async function termIdNow(): Promise<string> {
  const term = await getCurrentTerm();
  if (!term) throw new DomainError(t("T-032"));
  return term.id;
}

function withQuestions(questions: string[], answers: string[]) {
  if (!answers.some((answer) => answer.trim().length > 0)) {
    throw new DomainError(tList("T-5129")[3] ?? "");
  }
  return questions.map((question, index) => ({
    question,
    answer: (answers[index] ?? "").trim(),
  }));
}

export const editionEntryInputSchema = z.object({
  editionId: z.string().trim().min(1),
  kind: z.enum(["EDITION_PLAN", "EDITION_MEETING"]),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  occurredOn: z.iso.date().optional(),
  answers: z.array(z.string().max(4000)).max(30),
});

export type EditionEntryInput = z.input<typeof editionEntryInputSchema>;

/** El plan del mes (uno por mes) o una reunión con Desarrollo Estudiantil; los escribe la Presidencia. */
export async function saveEditionEntry(
  ctx: CommandContext,
  raw: EditionEntryInput,
  now = new Date(),
): Promise<{ id: string }> {
  const input = editionEntryInputSchema.parse(raw);
  await assertPresidency(ctx);
  await assertOpen(ctx, input.editionId);
  const answers = withQuestions(await templateQuestions(input.kind, null, ctx.tx), input.answers);
  const termId = await termIdNow();
  const today = todayKey(now);
  if (input.kind === "EDITION_PLAN") {
    const month = input.month ?? today.slice(0, 7);
    const [before] = await ctx.tx
      .select()
      .from(followUpEntry)
      .where(
        and(
          eq(followUpEntry.kind, "EDITION_PLAN"),
          eq(followUpEntry.editionId, input.editionId),
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
    return insert(ctx, {
      kind: "EDITION_PLAN",
      termId,
      editionId: input.editionId,
      month,
      occurredOn: `${month}-01`,
      answers,
    });
  }
  return insert(ctx, {
    kind: "EDITION_MEETING",
    termId,
    editionId: input.editionId,
    occurredOn: input.occurredOn ?? today,
    answers,
  });
}

async function insert(ctx: CommandContext, values: typeof followUpEntry.$inferInsert) {
  const [row] = await ctx.tx
    .insert(followUpEntry)
    .values({ ...values, authorId: ctx.actor.personId })
    .returning({ id: followUpEntry.id });
  if (!row) throw new Error("No se pudo guardar el seguimiento");
  await ctx.audit({
    action: "follow-up.entry-created",
    entityType: "follow_up_entry",
    entityId: row.id,
    after: values,
  });
  return row;
}

export const handoverInputSchema = z.object({
  editionId: z.string().trim().min(1),
  roleCode: z.string().trim().min(1).max(60),
  answers: z.array(z.string().max(4000)).max(40),
});

export type HandoverInput = z.input<typeof handoverInputSchema>;

/** El empalme de un cargo de la mesa: lo entrega quien tiene ese cargo; entregarlo otra vez lo cambia. */
export async function saveEditionHandover(
  ctx: CommandContext,
  raw: HandoverInput,
): Promise<{ id: string }> {
  const input = handoverInputSchema.parse(raw);
  const mine =
    ctx.actor.personId !== null &&
    (await isMacroeventDirector(ctx.actor.personId, input.editionId, input.roleCode, ctx.tx));
  if (!mine) throw new DomainError(guard(1));
  await assertOpen(ctx, input.editionId);
  const answers = withQuestions(
    await templateQuestions("EDITION_HANDOVER", input.roleCode, ctx.tx),
    input.answers,
  );
  const [before] = await ctx.tx
    .select()
    .from(followUpEntry)
    .where(
      and(
        eq(followUpEntry.kind, "EDITION_HANDOVER"),
        eq(followUpEntry.editionId, input.editionId),
        eq(followUpEntry.roleCode, input.roleCode),
      ),
    );
  if (before) {
    await ctx.tx
      .update(followUpEntry)
      .set({ answers, authorId: ctx.actor.personId, occurredOn: todayKey() })
      .where(eq(followUpEntry.id, before.id));
    await ctx.audit({
      action: "follow-up.handover-updated",
      entityType: "follow_up_entry",
      entityId: before.id,
      before: { answers: before.answers },
      after: { answers },
    });
    return { id: before.id };
  }
  return insert(ctx, {
    kind: "EDITION_HANDOVER",
    termId: await termIdNow(),
    editionId: input.editionId,
    roleCode: input.roleCode,
    occurredOn: todayKey(),
    answers,
  });
}

export interface HandoverStatus {
  roleCode: string;
  roleLabel: string;
  holders: string[];
  entry: FollowUpEntryRow | null;
}

/** Los cargos de la mesa de una edición, cada uno con su empalme o sin él. */
export async function editionHandovers(editionId: string): Promise<HandoverStatus[]> {
  const [board, entries] = await Promise.all([
    listMacroeventBoard(editionId),
    getDb()
      .select()
      .from(followUpEntry)
      .where(
        and(eq(followUpEntry.kind, "EDITION_HANDOVER"), eq(followUpEntry.editionId, editionId)),
      ),
  ]);
  const byRole = new Map<string, HandoverStatus>();
  for (const seat of board) {
    const status = byRole.get(seat.roleCode) ?? {
      roleCode: seat.roleCode,
      roleLabel: seat.roleLabel,
      holders: [],
      entry: entries.find((entry) => entry.roleCode === seat.roleCode) ?? null,
    };
    status.holders.push(seat.personId);
    byRole.set(seat.roleCode, status);
  }
  return [...byRole.values()];
}

/** Cierra el seguimiento de la edición; sin todos los empalmes no se cierra (ADR-197 regla 5). */
export async function closeEditionFollowUp(ctx: CommandContext, editionId: string): Promise<void> {
  await assertPresidency(ctx);
  await assertOpen(ctx, editionId);
  const missing = (await editionHandovers(editionId)).filter((item) => !item.entry);
  if (missing.length > 0) {
    throw new DomainError(
      (guard(2) ?? "").replace("{cargos}", missing.map((item) => item.roleLabel).join(", ")),
    );
  }
  await ctx.tx
    .insert(editionFollowUp)
    .values({ editionId, closedAt: new Date(), closedById: ctx.actor.personId });
  await ctx.audit({
    action: "follow-up.edition-closed",
    entityType: "event_edition",
    entityId: editionId,
  });
}

export async function editionLog(editionId: string): Promise<FollowUpEntryRow[]> {
  return getDb()
    .select()
    .from(followUpEntry)
    .where(
      and(
        eq(followUpEntry.editionId, editionId),
        inArray(followUpEntry.kind, ["EDITION_PLAN", "EDITION_MEETING"]),
      ),
    )
    .orderBy(desc(followUpEntry.occurredOn), desc(followUpEntry.createdAt));
}

export async function editionClosure(editionId: string) {
  const [row] = await getDb()
    .select()
    .from(editionFollowUp)
    .where(eq(editionFollowUp.editionId, editionId));
  return row ?? null;
}

export interface EditionFollowUpRow {
  id: string;
  label: string;
  startsAt: Date;
  endsAt: Date | null;
  delivered: number;
  total: number;
  closedAt: Date | null;
}

const DAY_MS = 86_400_000;

/** Las ediciones del último año y del próximo, con cuántos empalmes van y si se cerró. */
export async function listEditionFollowUps(now = new Date()): Promise<EditionFollowUpRow[]> {
  const editions = await listEditionsBetween(
    new Date(now.getTime() - 365 * DAY_MS),
    new Date(now.getTime() + 365 * DAY_MS),
  );
  const ids = editions.map((row) => row.id);
  const closures =
    ids.length > 0
      ? await getDb().select().from(editionFollowUp).where(inArray(editionFollowUp.editionId, ids))
      : [];
  const closedAt = new Map(closures.map((row) => [row.editionId, row.closedAt]));
  const rows = await Promise.all(
    editions.map(async (row) => {
      const handovers = await editionHandovers(row.id);
      return {
        id: row.id,
        label: `${row.eventName} · ${row.name}`,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        delivered: handovers.filter((item) => item.entry).length,
        total: handovers.length,
        closedAt: closedAt.get(row.id) ?? null,
      };
    }),
  );
  return rows.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}

/** Las ediciones que ya terminaron, con mesa y sin cerrar: van a la Mesa de la Presidencia. */
export async function editionsPendingClosure(now = new Date()): Promise<EditionFollowUpRow[]> {
  return (await listEditionFollowUps(now)).filter(
    (row) => !row.closedAt && row.total > 0 && (row.endsAt ?? row.startsAt) < now,
  );
}

export interface MyEditionHandover {
  editionId: string;
  editionLabel: string;
  roleCode: string;
  roleLabel: string;
  questions: string[];
  entry: FollowUpEntryRow | null;
  closed: boolean;
  received: FollowUpEntryRow | null;
  receivedLabel: string | null;
}

/**
 * Los empalmes de la persona en Mi OE: el que entrega por cada cargo de mesa y el que recibe de la
 * edición anterior del mismo macroevento (Regl. art. 66).
 */
export async function myEditionHandovers(personId: string): Promise<MyEditionHandover[]> {
  const seats = await listMyMacroeventSeats(personId);
  const labels = await listEditionRefs([...new Set(seats.map((seat) => seat.editionId))]);
  return Promise.all(
    seats.map(async (seat) => {
      const [questions, own, closure, previous] = await Promise.all([
        templateQuestions("EDITION_HANDOVER", seat.roleCode),
        handoverOf(seat.editionId, seat.roleCode),
        editionClosure(seat.editionId),
        previousEditionOf(seat.editionId),
      ]);
      const ref = labels.get(seat.editionId);
      return {
        ...seat,
        editionLabel: ref ? `${ref.eventName} · ${ref.name}` : "",
        questions,
        entry: own,
        closed: closure !== null,
        received: previous ? await handoverOf(previous.id, seat.roleCode) : null,
        receivedLabel: previous ? `${previous.eventName} · ${previous.name}` : null,
      };
    }),
  );
}

async function handoverOf(editionId: string, roleCode: string): Promise<FollowUpEntryRow | null> {
  const [row] = await getDb()
    .select()
    .from(followUpEntry)
    .where(
      and(
        eq(followUpEntry.kind, "EDITION_HANDOVER"),
        eq(followUpEntry.editionId, editionId),
        eq(followUpEntry.roleCode, roleCode),
      ),
    );
  return row ?? null;
}

export function saveEditionEntryAs(
  actor: Actor,
  input: EditionEntryInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => saveEditionEntry(ctx, input));
}

export function saveEditionHandoverAs(actor: Actor, input: HandoverInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => saveEditionHandover(ctx, input));
}

export function closeEditionFollowUpAs(actor: Actor, editionId: string): Promise<void> {
  return runCommand(actor, (ctx) => closeEditionFollowUp(ctx, editionId));
}
