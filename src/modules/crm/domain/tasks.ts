import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { getPeopleByIds } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { organization, task } from "../schema";

// Tareas (02-crm.md): pendiente con responsable y vencimiento sobre una persona; sin responsable la ven
// todos los ADMIN.

export const TASK_KINDS = ["GENERAL", "DELETION_REQUEST", "REQUEST"] as const;

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
