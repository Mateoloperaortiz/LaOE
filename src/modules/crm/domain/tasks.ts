import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { getPeopleByIds } from "@/modules/people";
import { requireConfigIn } from "@/modules/system";
import { t } from "@/shared/copy";
import { addBusinessDays, bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { organization, task } from "../schema";

// Tareas (02-crm.md): pendiente con responsable y vencimiento sobre una persona; sin responsable la ven
// todos los ADMIN. Hay dos entradas (ADR-115 regla 9): `createTask`, la que una persona crea a mano
// desde una ficha, y `openTaskForReason`, la que abre el sistema por un motivo, una sola por motivo y
// sujeto mientras siga abierta. Fuera de esas dos, la aplicación no inserta en `task`; el seed de
// demostración (`scripts/lib/seed-fase5.ts`) sí escribe las suyas, directo y sin clave.

export const TASK_KINDS = [
  "GENERAL",
  "DELETION_REQUEST",
  "REQUEST",
  "COMMITTEE_REMOVAL",
  "LEAVE_EXPIRED",
] as const;

export const taskInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  kind: z.enum(TASK_KINDS).default("GENERAL"),
  assigneeId: z.string().trim().min(1).optional(),
  dueAt: z.string().regex(LOCAL_INPUT).optional(),
  personId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  cardId: z.string().trim().min(1).optional(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export interface TaskRow {
  id: string;
  title: string;
  kind: string;
  status: "OPEN" | "DONE";
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: Date | null;
  personId: string | null;
  personName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  cardId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface TaskListParams {
  q: string;
  /** "mine" (del actor), "unassigned" o cualquier otra cosa (todas). */
  assignee?: string | undefined;
  actorId?: string | undefined;
  status?: string | undefined;
  personId?: string | undefined;
  organizationId?: string | undefined;
  /** Solo vencidas y abiertas (tablero del admin). */
  overdue?: boolean | undefined;
  page: number;
  pageSize: number;
}

async function organizationNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(inArray(organization.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function withNames(rows: Array<typeof task.$inferSelect>): Promise<TaskRow[]> {
  const people = await getPeopleByIds([
    ...rows.flatMap((row) => (row.assigneeId ? [row.assigneeId] : [])),
    ...rows.flatMap((row) => (row.personId ? [row.personId] : [])),
  ]);
  const organizations = await organizationNames(
    rows.flatMap((row) => (row.organizationId ? [row.organizationId] : [])),
  );
  const name = (id: string | null) => (id ? (people.get(id)?.fullName?.trim() ?? null) : null);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    assigneeId: row.assigneeId,
    assigneeName: name(row.assigneeId),
    dueAt: row.dueAt,
    personId: row.personId,
    personName: name(row.personId),
    organizationId: row.organizationId,
    organizationName: row.organizationId ? (organizations.get(row.organizationId) ?? null) : null,
    cardId: row.cardId,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }));
}

export async function listTasks(
  params: TaskListParams,
): Promise<{ rows: TaskRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(task.title, `%${params.q}%`));
  }
  if (params.status === "OPEN" || params.status === "DONE") {
    conditions.push(eq(task.status, params.status));
  }
  if (params.personId) {
    conditions.push(eq(task.personId, params.personId));
  }
  if (params.organizationId) {
    conditions.push(eq(task.organizationId, params.organizationId));
  }
  if (params.overdue) {
    conditions.push(eq(task.status, "OPEN"), lt(task.dueAt, new Date()));
  }
  if (params.assignee === "mine") {
    conditions.push(params.actorId ? eq(task.assigneeId, params.actorId) : sql`false`);
  } else if (params.assignee === "unassigned") {
    conditions.push(isNull(task.assigneeId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(task)
      .where(where)
      .orderBy(asc(task.status), sql`${task.dueAt} asc nulls last`, desc(task.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(task).where(where),
  ]);
  return { rows: await withNames(rows), total: total?.n ?? 0 };
}

export async function getTask(id: string): Promise<TaskRow | null> {
  const [row] = await getDb().select().from(task).where(eq(task.id, id)).limit(1);
  return row ? ((await withNames([row]))[0] ?? null) : null;
}

export async function createTask(ctx: CommandContext, input: TaskInput): Promise<{ id: string }> {
  const values = {
    title: input.title,
    kind: input.kind,
    assigneeId: input.assigneeId ?? null,
    dueAt: input.dueAt ? bogotaInputToUtc(input.dueAt) : null,
    personId: input.personId ?? null,
    organizationId: input.organizationId ?? null,
    cardId: input.cardId ?? null,
    createdById: ctx.actor.personId,
  };
  const [row] = await ctx.tx.insert(task).values(values).returning({ id: task.id });
  if (!row) {
    throw new Error("No se pudo crear la tarea");
  }
  await ctx.audit({ action: "task.created", entityType: "task", entityId: row.id, after: values });
  return row;
}

/**
 * Por qué abre el sistema una tarea, y sobre quién o qué: un conjunto cerrado (ADR-115 regla 9). El
 * motivo y su sujeto son la identidad de la tarea mientras siga abierta; el título es solo lo que se lee.
 */
export type TaskReason =
  | { type: "DELETION_REQUEST"; personId: string }
  | { type: "COMMITTEE_REMOVAL"; personId: string; committeeId: string }
  | { type: "TERM_SUCCESSOR_MISSING"; termCode: string }
  | { type: "LEAVE_EXPIRED"; personId: string }
  | { type: "REQUEST"; requestId: string; personId: string }
  | { type: "SPONSORSHIP_WON"; cardId: string; organizationId: string }
  | { type: "GROUP_ADMISSION_FAILED"; personId: string; callId: string };

/** Las claves de la configuración que traen un plazo en días hábiles: un conjunto cerrado. */
const DUE_CONFIG_KEYS = ["privacy.deletionDays", "requests.taskDays"] as const;

/** Un instante, o los días hábiles de una clave de la configuración contados desde ahora. */
export type TaskDue = { at: Date } | { businessDays: (typeof DUE_CONFIG_KEYS)[number] };

/**
 * Lo que la entrada no reconoce (un motivo fuera del conjunto o sin sujeto, un título vacío, un
 * vencimiento que no es un instante ni una clave de plazo) lo rechaza con este error, antes de escribir.
 */
export class ReasonTaskInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReasonTaskInputError";
  }
}

function isInstant(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export interface ReasonTaskInput {
  reason: TaskReason;
  title: string;
  assigneeId: string | null;
  due: TaskDue | null;
  /** La persona que la pidió, si hubo una: queda como `createdById`. La auditoría lleva al actor. */
  requestedById: string | null;
  /** El instante desde el que se cuentan los días hábiles; por omisión, ahora. */
  now?: Date;
}

interface ReasonSpec {
  /** La clave que se guarda en `task.reasonKey`: el motivo y su sujeto. */
  key: string;
  kind: (typeof TASK_KINDS)[number];
  personId: string | null;
  organizationId: string | null;
  cardId: string | null;
  /**
   * Cómo reconocía ese sitio su tarea abierta antes de que existiera la clave. Solo se aplica a las
   * tareas sin clave, que son las anteriores a la regla, para no duplicarles la suya (DT-123).
   */
  legacy: SQL | undefined;
}

/** Un id vacío no identifica nada: falla cerrado, antes de tocar la base. */
function requireId(type: TaskReason["type"], value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ReasonTaskInputError(`Al motivo ${type} le falta su sujeto`);
  }
  return value;
}

function reasonSpec(reason: TaskReason, title: string): ReasonSpec {
  if (typeof reason !== "object" || reason === null) {
    throw new ReasonTaskInputError("A la tarea le falta su motivo");
  }
  const none = { personId: null, organizationId: null, cardId: null, legacy: undefined };
  switch (reason.type) {
    case "DELETION_REQUEST": {
      const personId = requireId(reason.type, reason.personId);
      return {
        ...none,
        key: `${reason.type}:person:${personId}`,
        kind: "DELETION_REQUEST",
        personId,
        legacy: and(eq(task.personId, personId), eq(task.kind, "DELETION_REQUEST")),
      };
    }
    case "COMMITTEE_REMOVAL": {
      const personId = requireId(reason.type, reason.personId);
      const committeeId = requireId(reason.type, reason.committeeId);
      return {
        ...none,
        key: `${reason.type}:person:${personId}:committee:${committeeId}`,
        kind: "COMMITTEE_REMOVAL",
        personId,
        legacy: and(
          eq(task.personId, personId),
          eq(task.kind, "COMMITTEE_REMOVAL"),
          eq(task.title, title),
        ),
      };
    }
    case "TERM_SUCCESSOR_MISSING":
      return {
        ...none,
        key: `${reason.type}:term:${requireId(reason.type, reason.termCode)}`,
        kind: "GENERAL",
        legacy: eq(task.title, title),
      };
    case "LEAVE_EXPIRED": {
      const personId = requireId(reason.type, reason.personId);
      return {
        ...none,
        key: `${reason.type}:person:${personId}`,
        kind: "LEAVE_EXPIRED",
        personId,
        legacy: and(eq(task.personId, personId), eq(task.kind, "LEAVE_EXPIRED")),
      };
    }
    // La solicitud y la tarjeta no buscaban una tarea abierta: no tienen regla vieja.
    case "REQUEST":
      return {
        ...none,
        key: `${reason.type}:request:${requireId(reason.type, reason.requestId)}`,
        kind: "REQUEST",
        personId: requireId(reason.type, reason.personId),
      };
    case "SPONSORSHIP_WON":
      return {
        ...none,
        key: `${reason.type}:card:${requireId(reason.type, reason.cardId)}`,
        kind: "GENERAL",
        organizationId: requireId(reason.type, reason.organizationId),
        cardId: reason.cardId,
      };
    // Una inscripción aceptada que no entró a su grupo (ADR-116 regla 7): una por persona y convocatoria.
    case "GROUP_ADMISSION_FAILED": {
      const personId = requireId(reason.type, reason.personId);
      return {
        ...none,
        key: `${reason.type}:person:${personId}:call:${requireId(reason.type, reason.callId)}`,
        kind: "GENERAL",
        personId,
      };
    }
    default:
      // Falla cerrado: un motivo que no está en el conjunto no abre nada.
      throw new ReasonTaskInputError(
        `Motivo de tarea desconocido: ${String((reason as { type?: unknown }).type)}`,
      );
  }
}

/**
 * El vencimiento como instante. El plazo en días hábiles se lee por la conexión del comando, no del
 * pool: con la transacción abierta, una lectura por otra conexión deja a una ráfaga esperándose a sí misma.
 */
async function dueInstant(
  ctx: CommandContext,
  due: TaskDue | null,
  now: Date,
): Promise<Date | null> {
  if (due === null) {
    return null;
  }
  if (typeof due !== "object") {
    throw new ReasonTaskInputError("El vencimiento de la tarea no se reconoce");
  }
  if ("at" in due) {
    if (!isInstant(due.at)) {
      throw new ReasonTaskInputError("El vencimiento de la tarea no es un instante");
    }
    return due.at;
  }
  if (!DUE_CONFIG_KEYS.includes(due.businessDays)) {
    throw new ReasonTaskInputError("El vencimiento de la tarea no se reconoce");
  }
  if (!isInstant(now)) {
    throw new ReasonTaskInputError("El instante desde el que se cuenta el plazo no es un instante");
  }
  return addBusinessDays(now, await requireConfigIn(ctx, due.businessDays));
}

/**
 * Abre la tarea de un motivo, o devuelve la que ya está abierta por ese motivo y ese sujeto (ADR-115
 * regla 9). Busca y escribe bajo un candado consultivo por clave, que dura lo que la transacción: dos
 * aperturas a la vez de la misma tarea dejan una. Siempre audita la que crea, con lo que la identifica
 * y sin su título.
 */
export async function openTaskForReason(
  ctx: CommandContext,
  input: ReasonTaskInput,
): Promise<{ id: string; created: boolean }> {
  const spec = reasonSpec(input.reason, input.title);
  if (typeof input.title !== "string" || input.title.trim() === "") {
    throw new ReasonTaskInputError("A la tarea le falta su título");
  }
  const dueAt = await dueInstant(ctx, input.due, input.now ?? new Date());
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`task:${spec.key}`}, 0))`,
  );
  const findOpen = (where: SQL | undefined) =>
    ctx.tx
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.status, "OPEN"), where))
      .orderBy(asc(task.createdAt), asc(task.id))
      .limit(1);
  let [existing] = await findOpen(eq(task.reasonKey, spec.key));
  if (!existing && spec.legacy) {
    // Las tareas anteriores a la clave se reconocen con la regla vieja de su motivo (DT-123).
    [existing] = await findOpen(and(isNull(task.reasonKey), spec.legacy));
  }
  if (existing) {
    return { id: existing.id, created: false };
  }
  // Lo que identifica a la tarea. El título no va a la auditoría: nombra a la persona, y la auditoría
  // de una tarea se queda cuando la anonimización borra la fila (ADR-030).
  const facts = {
    kind: spec.kind,
    assigneeId: input.assigneeId,
    dueAt,
    personId: spec.personId,
    organizationId: spec.organizationId,
    cardId: spec.cardId,
    reasonKey: spec.key,
    createdById: input.requestedById,
  };
  const [row] = await ctx.tx
    .insert(task)
    .values({ title: input.title, ...facts })
    .returning({ id: task.id });
  if (!row) {
    throw new Error("No se pudo crear la tarea");
  }
  await ctx.audit({ action: "task.created", entityType: "task", entityId: row.id, after: facts });
  return { id: row.id, created: true };
}

export async function completeTask(ctx: CommandContext, id: string): Promise<void> {
  const [row] = await ctx.tx.select().from(task).where(eq(task.id, id));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status === "DONE") {
    return;
  }
  await ctx.tx
    .update(task)
    .set({ status: "DONE", completedAt: new Date(), completedById: ctx.actor.personId })
    .where(eq(task.id, id));
  await ctx.audit({
    action: "task.completed",
    entityType: "task",
    entityId: id,
    before: { status: row.status },
    after: { status: "DONE" },
  });
}

export async function countOpenTasksFor(personId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(task)
    .where(and(eq(task.personId, personId), eq(task.status, "OPEN")));
  return row?.n ?? 0;
}

/** Salida o anonimización (ADR-030): las tareas sobre la persona no son historia y se borran. */
export async function deleteTasksFor(personId: string): Promise<number> {
  const deleted = await getDb()
    .delete(task)
    .where(eq(task.personId, personId))
    .returning({ id: task.id });
  return deleted.length;
}
