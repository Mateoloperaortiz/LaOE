import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import {
  createSubmission,
  type FormView,
  getFormsByIds,
  getFormView,
  getSubmissionsByIds,
  validateAnswers,
} from "@/modules/forms";
import { getMembershipRef, getPeopleByIds, getPersonRecord } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { internalCall, internalCallEntry } from "../schema";
import {
  CALL_SELECTIONS,
  CALL_STATUSES,
  type CallEntryStatus,
  hasRoom,
  initialEntryStatus,
  isCallOpen,
} from "./calls-pure";

// Convocatorias internas (ADR-031, ADR-037 regla 10): formulario opcional, cupo, ventana y selección
// por orden de llegada (con lista de espera) o manual. La aceptación entra al grupo por outbox.

export type CallRecord = typeof internalCall.$inferSelect;
export type CallEntryRecord = typeof internalCallEntry.$inferSelect;

const localDateTime = z
  .string()
  .trim()
  .regex(LOCAL_INPUT, { message: t("T-298") });

export const callInputSchema = z
  .object({
    termId: z.string().trim().min(1),
    groupId: z.string().trim().min(1),
    formId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(2).max(120),
    description: z.string().max(20_000).default(""),
    opensAt: localDateTime.transform(bogotaInputToUtc),
    closesAt: localDateTime.transform(bogotaInputToUtc),
    capacity: z.coerce.number().int().min(1).max(10_000).optional(),
    selection: z.enum(CALL_SELECTIONS).default("FIRST_COME"),
    status: z.enum(CALL_STATUSES).default("DRAFT"),
  })
  .refine((input) => input.closesAt > input.opensAt, { path: ["closesAt"], message: t("T-1028") });

export type CallInput = z.infer<typeof callInputSchema>;

export interface CallListRow extends CallRecord {
  entries: number;
  accepted: number;
  formTitle: string | null;
}

export interface CallListParams {
  q: string;
  termId?: string | undefined;
  groupId?: string | undefined;
  status?: string | undefined;
  page: number;
  pageSize: number;
}

// La tabla exterior va literal: dentro de una plantilla `sql` las columnas salen sin calificar.
const entries =
  sql<number>`(select count(*) from internal_call_entry e where e.call_id = internal_call.id)`.mapWith(
    Number,
  );
const accepted =
  sql<number>`(select count(*) from internal_call_entry e where e.call_id = internal_call.id and e.status = 'ACCEPTED')`.mapWith(
    Number,
  );

async function withForms(
  rows: Array<CallRecord & { entries: number; accepted: number }>,
): Promise<CallListRow[]> {
  const forms = await getFormsByIds(rows.flatMap((row) => (row.formId ? [row.formId] : [])));
  return rows.map((row) => ({
    ...row,
    formTitle: row.formId ? (forms.get(row.formId)?.title ?? null) : null,
  }));
}

export async function listCalls(
  params: CallListParams,
): Promise<{ rows: CallListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(internalCall.title, `%${params.q}%`));
  }
  if (params.termId) {
    conditions.push(eq(internalCall.termId, params.termId));
  }
  if (params.groupId) {
    conditions.push(eq(internalCall.groupId, params.groupId));
  }
  if ((CALL_STATUSES as readonly string[]).includes(params.status ?? "")) {
    conditions.push(eq(internalCall.status, params.status as CallRecord["status"]));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({ row: internalCall, entries, accepted })
      .from(internalCall)
      .where(where)
      .orderBy(desc(internalCall.opensAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(internalCall).where(where),
  ]);
  return {
    rows: await withForms(
      rows.map((item) => ({ ...item.row, entries: item.entries, accepted: item.accepted })),
    ),
    total: total?.n ?? 0,
  };
}

export async function getCall(id: string): Promise<CallListRow | null> {
  const [row] = await getDb()
    .select({ row: internalCall, entries, accepted })
    .from(internalCall)
    .where(eq(internalCall.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  return (
    (await withForms([{ ...row.row, entries: row.entries, accepted: row.accepted }]))[0] ?? null
  );
}

/** Convocatorias abiertas del término (Mi OE): OPEN y dentro de la ventana, las que cierran antes primero. */
export async function listOpenCalls(termId: string, now = new Date()): Promise<CallListRow[]> {
  const rows = await getDb()
    .select({ row: internalCall, entries, accepted })
    .from(internalCall)
    .where(and(eq(internalCall.termId, termId), eq(internalCall.status, "OPEN")))
    .orderBy(asc(internalCall.closesAt));
  const open = rows.filter((item) => isCallOpen(item.row, now));
  return withForms(
    open.map((item) => ({ ...item.row, entries: item.entries, accepted: item.accepted })),
  );
}

export interface CallEntryView extends CallEntryRecord {
  fullName: string;
  email: string;
  answers: Record<string, unknown> | null;
}

export async function listCallEntries(callId: string): Promise<CallEntryView[]> {
  const rows = await getDb()
    .select()
    .from(internalCallEntry)
    .where(eq(internalCallEntry.callId, callId))
    .orderBy(asc(internalCallEntry.createdAt));
  const people = await getPeopleByIds(rows.map((row) => row.personId));
  const submissions = await getSubmissionsByIds(
    rows.flatMap((row) => (row.submissionId ? [row.submissionId] : [])),
  );
  return rows.map((row) => ({
    ...row,
    fullName: people.get(row.personId)?.fullName ?? "",
    email: people.get(row.personId)?.email ?? "",
    answers: row.submissionId ? (submissions.get(row.submissionId)?.answers ?? null) : null,
  }));
}

/** Mis inscripciones con el título de la convocatoria (Mi OE). */
export async function listMyEntries(
  personId: string,
): Promise<Array<CallEntryRecord & { callTitle: string; groupId: string }>> {
  const rows = await getDb()
    .select({
      entry: internalCallEntry,
      callTitle: internalCall.title,
      groupId: internalCall.groupId,
    })
    .from(internalCallEntry)
    .innerJoin(internalCall, eq(internalCall.id, internalCallEntry.callId))
    .where(eq(internalCallEntry.personId, personId))
    .orderBy(desc(internalCallEntry.createdAt));
  return rows.map((row) => ({ ...row.entry, callTitle: row.callTitle, groupId: row.groupId }));
}

function toValues(input: CallInput) {
  return {
    termId: input.termId,
    groupId: input.groupId,
    formId: input.formId ?? null,
    title: input.title,
    description: input.description,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    capacity: input.capacity ?? null,
    selection: input.selection,
    status: input.status,
  };
}

export async function createCall(ctx: CommandContext, input: CallInput): Promise<{ id: string }> {
  const [row] = await ctx.tx
    .insert(internalCall)
    .values({ ...toValues(input), createdById: ctx.actor.personId })
    .returning({ id: internalCall.id });
  if (!row) {
    throw new Error("No se pudo crear la convocatoria");
  }
  await ctx.audit({
    action: "call.created",
    entityType: "internal_call",
    entityId: row.id,
    after: toValues(input),
  });
  if (input.status === "OPEN") {
    await emitCallOpened(ctx, row.id, input);
  }
  return row;
}

/** Convocatoria abierta (ADR-038 regla 7): comms manda T-190 a los activos. */
async function emitCallOpened(
  ctx: CommandContext,
  id: string,
  values: {
    termId: string;
    groupId: string;
    title: string;
    closesAt: Date;
    capacity?: number | undefined;
  },
): Promise<void> {
  await ctx.emit({
    type: "call.opened",
    payload: {
      callId: id,
      termId: values.termId,
      groupId: values.groupId,
      title: values.title,
      closesAt: values.closesAt.toISOString(),
      capacity: values.capacity ?? null,
      actorId: ctx.actor.personId,
    },
    dedupeKey: `call-opened:${id}`,
  });
}

export async function updateCall(ctx: CommandContext, id: string, input: CallInput): Promise<void> {
  const [before] = await ctx.tx.select().from(internalCall).where(eq(internalCall.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = toValues(input);
  await ctx.tx.update(internalCall).set(values).where(eq(internalCall.id, id));
  await ctx.audit({
    action: "call.updated",
    entityType: "internal_call",
    entityId: id,
    before,
    after: values,
  });
}

export async function setCallStatus(
  ctx: CommandContext,
  id: string,
  status: "OPEN" | "CLOSED",
): Promise<void> {
  const [before] = await ctx.tx
    .select({ status: internalCall.status })
    .from(internalCall)
    .where(eq(internalCall.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  if (before.status === status) {
    return;
  }
  await ctx.tx.update(internalCall).set({ status }).where(eq(internalCall.id, id));
  await ctx.audit({
    action: status === "OPEN" ? "call.opened" : "call.closed",
    entityType: "internal_call",
    entityId: id,
    before,
    after: { status },
  });
  if (status === "OPEN") {
    const [row] = await ctx.tx.select().from(internalCall).where(eq(internalCall.id, id));
    if (row) {
      await emitCallOpened(ctx, id, {
        termId: row.termId,
        groupId: row.groupId,
        title: row.title,
        closesAt: row.closesAt,
        capacity: row.capacity ?? undefined,
      });
    }
  }
}

export interface ApplyContext {
  /** La persona ya está viva en el grupo (lo sabe permanence; lo compone la capa de la app). */
  inGroup: boolean;
}

export type ApplyResult = { status: CallEntryStatus; entryId: string };

/**
 * "Me apunto" desde Mi OE: solo miembros activos que no estén en el grupo, con la convocatoria abierta;
 * con formulario, la respuesta se guarda como respuesta de miembros. Por orden de llegada queda aceptada
 * mientras haya cupo (contado con la convocatoria bloqueada) y en lista de espera después; manual queda
 * pendiente. Cada cambio de estado emite `call-entry.changed`.
 */
export async function applyToCallAs(
  actor: Actor & { personId: string },
  callId: string,
  rawAnswers: Record<string, unknown>,
  context: ApplyContext,
  now = new Date(),
): Promise<ApplyResult> {
  const call = await getCall(callId);
  if (!call) {
    throw new DomainError(t("T-032"));
  }
  if (!isCallOpen(call, now)) {
    throw new DomainError(t("T-904"));
  }
  const membership = await getMembershipRef(actor.personId);
  if (!membership || membership.status !== "ACTIVE") {
    throw new DomainError(t("T-907"));
  }
  if (context.inGroup) {
    throw new DomainError(t("T-900", { grupo: call.title }));
  }
  let form: FormView | null = null;
  let answers: Record<string, unknown> = {};
  if (call.formId) {
    form = await getFormView(call.formId);
    if (form) {
      const validated = validateAnswers(form.parsedFields, rawAnswers);
      if (!validated.ok) {
        const [field, code] = Object.entries(validated.errors)[0] ?? ["", "T-853"];
        throw new DomainError(t(code as "T-853"), field);
      }
      answers = validated.answers;
    }
  }
  const who = await getPersonRecord(actor.personId);
  if (!who) {
    throw new DomainError(t("T-032"));
  }
  return runCommand(actor, async (ctx) => {
    const [locked] = await ctx.tx
      .select()
      .from(internalCall)
      .where(eq(internalCall.id, callId))
      .for("update");
    if (!locked || !isCallOpen(locked, now)) {
      throw new DomainError(t("T-904"));
    }
    const [acceptedNow] = await ctx.tx
      .select({ n: count() })
      .from(internalCallEntry)
      .where(and(eq(internalCallEntry.callId, callId), eq(internalCallEntry.status, "ACCEPTED")));
    const status = initialEntryStatus(locked.selection, locked.capacity, acceptedNow?.n ?? 0);
    let submissionId: string | null = null;
    if (form) {
      const created = await createSubmission(ctx, {
        form,
        personId: actor.personId,
        email: who.email,
        firstName: who.firstName,
        lastName: who.lastName,
        answers: answers as Parameters<typeof createSubmission>[1]["answers"],
        consentAcceptedAt: null,
        ip: actor.ip ?? null,
      });
      submissionId = created.id;
    }
    const [entry] = await ctx.tx
      .insert(internalCallEntry)
      .values({
        callId,
        personId: actor.personId,
        submissionId,
        status,
        decidedAt: status === "APPLIED" ? null : now,
      })
      .returning({ id: internalCallEntry.id })
      .catch((error: unknown) => {
        if (isUniqueViolation(error, "internal_call_entry_unique")) {
          throw new DomainError(t("T-903"));
        }
        throw error;
      });
    if (!entry) {
      throw new Error("No se pudo guardar la inscripción");
    }
    await ctx.audit({
      action: "call.applied",
      entityType: "internal_call",
      entityId: callId,
      after: { personId: actor.personId, status, submissionId },
    });
    await ctx.emit({
      type: "call-entry.changed",
      payload: {
        actorId: actor.personId,
        personId: actor.personId,
        callId,
        callTitle: locked.title,
        groupId: locked.groupId,
        status,
      },
    });
    return { status, entryId: entry.id };
  });
}

/**
 * El líder del grupo o ADMIN acepta, rechaza o promueve desde la lista de espera; aceptar exige cupo.
 * `callId` es la convocatoria que autorizó la página: una inscripción de otra responde T-032 (ADR-072).
 */
export async function decideEntryAs(
  actor: Actor,
  callId: string,
  entryId: string,
  status: "ACCEPTED" | "REJECTED",
  note?: string,
): Promise<void> {
  return runCommand(actor, async (ctx) => {
    const [entry] = await ctx.tx
      .select()
      .from(internalCallEntry)
      .where(and(eq(internalCallEntry.id, entryId), eq(internalCallEntry.callId, callId)));
    if (!entry) {
      throw new DomainError(t("T-032"));
    }
    const [locked] = await ctx.tx
      .select()
      .from(internalCall)
      .where(eq(internalCall.id, callId))
      .for("update");
    if (!locked) {
      throw new DomainError(t("T-032"));
    }
    if (entry.status === status) {
      return;
    }
    if (status === "ACCEPTED") {
      const [acceptedNow] = await ctx.tx
        .select({ n: count() })
        .from(internalCallEntry)
        .where(
          and(eq(internalCallEntry.callId, entry.callId), eq(internalCallEntry.status, "ACCEPTED")),
        );
      if (!hasRoom(locked.capacity, acceptedNow?.n ?? 0)) {
        throw new DomainError(t("T-1024"));
      }
    }
    await ctx.tx
      .update(internalCallEntry)
      .set({
        status,
        note: note?.trim() || null,
        decidedById: ctx.actor.personId,
        decidedAt: new Date(),
      })
      .where(eq(internalCallEntry.id, entryId));
    await ctx.audit({
      action: "call.entry-decided",
      entityType: "internal_call",
      entityId: entry.callId,
      before: { personId: entry.personId, status: entry.status },
      after: { personId: entry.personId, status, note: note ?? null },
    });
    await ctx.emit({
      type: "call-entry.changed",
      payload: {
        actorId: ctx.actor.personId,
        personId: entry.personId,
        callId: entry.callId,
        callTitle: locked.title,
        groupId: locked.groupId,
        status,
      },
    });
  });
}

// Wrappers con transacción para las páginas.

export function setCallStatusAs(
  actor: Actor,
  id: string,
  status: "OPEN" | "CLOSED",
): Promise<void> {
  return runCommand(actor, (ctx) => setCallStatus(ctx, id, status));
}

/** Convocatorias por grupo (detalle del grupo). */
export async function countCallsByGroup(groupIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (groupIds.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({ groupId: internalCall.groupId, n: count() })
    .from(internalCall)
    .where(inArray(internalCall.groupId, groupIds))
    .groupBy(internalCall.groupId);
  for (const row of rows) {
    map.set(row.groupId, row.n);
  }
  return map;
}
