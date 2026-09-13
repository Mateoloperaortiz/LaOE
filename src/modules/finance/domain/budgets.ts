import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { listCommitteesByIds } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import {
  budgetExpense,
  budgetLine,
  budgetPrerequest,
  budgetTransfer,
  committeeBudget,
  eventApproval,
} from "../schema";
import {
  APPROVERS,
  BUDGET_KINDS,
  BUDGET_STATUSES,
  type BudgetTotals,
  canOpen,
  type LineSummary,
  summarizeLines,
  totalsOf,
} from "./budget-pure";

// Presupuestos (ADR-059, ADR-060 regla 12): ADMIN (la junta) crea el ordinario del año y los
// extraordinarios, registra las aprobaciones, fija los rubros, abre, cierra y anota la sanción; nada se
// borra ni se edita una vez hay movimientos. Cada comando audita `budget.*`; no emite eventos.

export type BudgetRow = typeof committeeBudget.$inferSelect;
export type BudgetLineRow = typeof budgetLine.$inferSelect;

export const budgetInputSchema = z
  .object({
    committeeId: z.string().trim().min(1),
    year: z.coerce.number().int().min(2000).max(2100),
    kind: z.enum(BUDGET_KINDS).default("ORDINARY"),
    title: z.string().trim().max(120).default(""),
    notes: z.string().trim().max(2000).default(""),
    submittedOn: z.union([z.literal(""), z.iso.date()]).default(""),
  })
  .refine((input) => input.kind !== "EXTRAORDINARY" || input.title.length > 0, {
    path: ["title"],
    message: t("T-260"),
  });

export type BudgetInput = z.input<typeof budgetInputSchema>;

export const budgetLinesInputSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().trim().optional(),
        name: z.string().trim().min(1).max(80),
        assigned: z.coerce.number().min(0).max(1_000_000_000_000),
        sortOrder: z.coerce.number().int().min(0).default(0),
      }),
    )
    .max(40),
});

export type BudgetLinesInput = z.input<typeof budgetLinesInputSchema>;

export const approveBudgetSchema = z.object({
  approver: z.enum(APPROVERS),
  on: z.iso.date(),
});

export type ApproveBudgetInput = z.infer<typeof approveBudgetSchema>;

export const sanctionBudgetSchema = z.object({
  percent: z.coerce.number().min(0).max(100),
  reason: z.string().trim().min(2).max(500),
});

export type SanctionBudgetInput = z.input<typeof sanctionBudgetSchema>;

export interface BudgetListRow extends BudgetRow {
  committeeName: string;
  committeeSlug: string;
  assignedTotal: number;
}

export interface BudgetListParams {
  q: string;
  committeeId?: string | undefined;
  status?: string | undefined;
  kind?: string | undefined;
  page: number;
  pageSize: number;
}

const assignedTotal = sql<number>`coalesce((select sum(${budgetLine.assigned}) from ${budgetLine} where ${budgetLine.budgetId} = ${committeeBudget.id}), 0)`;

type ListedRow = BudgetRow & { assignedTotal: number };

/** Nombre y slug del comité por la API de people (finance no lee su esquema). */
async function withCommittees(rows: ListedRow[]): Promise<BudgetListRow[]> {
  const refs = await listCommitteesByIds([...new Set(rows.map((row) => row.committeeId))]);
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  return rows.map((row) => ({
    ...row,
    committeeName: byId.get(row.committeeId)?.name ?? "",
    committeeSlug: byId.get(row.committeeId)?.slug ?? "",
  }));
}

const listColumns = {
  id: committeeBudget.id,
  committeeId: committeeBudget.committeeId,
  year: committeeBudget.year,
  kind: committeeBudget.kind,
  title: committeeBudget.title,
  status: committeeBudget.status,
  notes: committeeBudget.notes,
  submittedOn: committeeBudget.submittedOn,
  studentDevelopmentApprovedOn: committeeBudget.studentDevelopmentApprovedOn,
  vpFinanceApprovedOn: committeeBudget.vpFinanceApprovedOn,
  sanctionPercent: committeeBudget.sanctionPercent,
  sanctionReason: committeeBudget.sanctionReason,
  createdAt: committeeBudget.createdAt,
  updatedAt: committeeBudget.updatedAt,
  assignedTotal: assignedTotal.mapWith(Number),
};

export async function listBudgets(
  params: BudgetListParams,
): Promise<{ rows: BudgetListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(
      or(
        ilike(committeeBudget.title, `%${params.q}%`),
        ilike(committeeBudget.notes, `%${params.q}%`),
      ),
    );
  }
  if (params.committeeId) {
    conditions.push(eq(committeeBudget.committeeId, params.committeeId));
  }
  if (params.status && (BUDGET_STATUSES as readonly string[]).includes(params.status)) {
    conditions.push(eq(committeeBudget.status, params.status as BudgetRow["status"]));
  }
  if (params.kind && (BUDGET_KINDS as readonly string[]).includes(params.kind)) {
    conditions.push(eq(committeeBudget.kind, params.kind as BudgetRow["kind"]));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select(listColumns)
      .from(committeeBudget)
      .where(where)
      .orderBy(
        desc(committeeBudget.year),
        asc(committeeBudget.committeeId),
        asc(committeeBudget.kind),
      )
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(committeeBudget).where(where),
  ]);
  return { rows: await withCommittees(rows), total: total?.n ?? 0 };
}

export async function getBudget(id: string): Promise<BudgetListRow | null> {
  const [row] = await getDb()
    .select(listColumns)
    .from(committeeBudget)
    .where(eq(committeeBudget.id, id))
    .limit(1);
  return row ? ((await withCommittees([row]))[0] ?? null) : null;
}

/** Los presupuestos de un comité en un año: el ordinario y los extraordinarios. */
export async function listCommitteeBudgets(
  committeeId: string,
  year: number,
): Promise<BudgetListRow[]> {
  const rows = await getDb()
    .select(listColumns)
    .from(committeeBudget)
    .where(and(eq(committeeBudget.committeeId, committeeId), eq(committeeBudget.year, year)))
    .orderBy(asc(committeeBudget.kind), asc(committeeBudget.createdAt));
  return withCommittees(rows);
}

function toValues(raw: BudgetInput) {
  const input = budgetInputSchema.parse(raw);
  return {
    committeeId: input.committeeId,
    year: input.year,
    kind: input.kind,
    title: input.kind === "EXTRAORDINARY" ? input.title : "",
    notes: input.notes,
    submittedOn: input.submittedOn || null,
  };
}

export async function createBudget(ctx: CommandContext, raw: BudgetInput): Promise<{ id: string }> {
  const values = toValues(raw);
  const [refs] = [await listCommitteesByIds([values.committeeId])];
  if (refs.length === 0) {
    throw new DomainError(t("T-032"), "committeeId");
  }
  try {
    const [row] = await ctx.tx
      .insert(committeeBudget)
      .values(values)
      .returning({ id: committeeBudget.id });
    if (!row) {
      throw new Error("No se pudo crear el presupuesto");
    }
    await ctx.audit({
      action: "budget.created",
      entityType: "committee_budget",
      entityId: row.id,
      after: values,
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "committee_budget_ordinary_unique")) {
      throw new DomainError(t("T-2287", { año: values.year }), "year");
    }
    throw error;
  }
}

async function lockBudget(ctx: CommandContext, id: string): Promise<BudgetRow> {
  const [row] = await ctx.tx
    .select()
    .from(committeeBudget)
    .where(eq(committeeBudget.id, id))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row;
}

/** En borrador se edita todo; abierto o cerrado, solo notas, actividad y fecha de presentación. */
export async function updateBudget(
  ctx: CommandContext,
  id: string,
  raw: BudgetInput,
): Promise<void> {
  const current = await lockBudget(ctx, id);
  const values = toValues(raw);
  const patch =
    current.status === "DRAFT"
      ? values
      : {
          notes: values.notes,
          title: values.title || current.title,
          submittedOn: values.submittedOn,
        };
  try {
    await ctx.tx.update(committeeBudget).set(patch).where(eq(committeeBudget.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "committee_budget_ordinary_unique")) {
      throw new DomainError(t("T-2287", { año: values.year }), "year");
    }
    throw error;
  }
  await ctx.audit({
    action: "budget.updated",
    entityType: "committee_budget",
    entityId: id,
    before: { status: current.status, notes: current.notes, title: current.title },
    after: patch,
  });
}

/** Fija los rubros (ADMIN): actualiza los que siguen, crea los nuevos y borra solo los sin movimientos. */
export async function setBudgetLines(
  ctx: CommandContext,
  budgetId: string,
  raw: BudgetLinesInput,
): Promise<void> {
  const budget = await lockBudget(ctx, budgetId);
  if (budget.status === "CLOSED") {
    throw new DomainError(t("T-2204", { año: budget.year }));
  }
  const { lines } = budgetLinesInputSchema.parse(raw);
  const current = await ctx.tx.select().from(budgetLine).where(eq(budgetLine.budgetId, budgetId));
  const keep = new Set(lines.map((line) => line.id).filter((id): id is string => Boolean(id)));
  const removed = current.filter((line) => !keep.has(line.id));
  if (removed.length > 0) {
    const ids = removed.map((line) => line.id);
    const [used] = await ctx.tx
      .select({ n: count() })
      .from(budgetExpense)
      .where(inArray(budgetExpense.lineId, ids));
    const [moved] = await ctx.tx
      .select({ n: count() })
      .from(budgetTransfer)
      .where(or(inArray(budgetTransfer.fromLineId, ids), inArray(budgetTransfer.toLineId, ids)));
    if ((used?.n ?? 0) > 0 || (moved?.n ?? 0) > 0) {
      throw new DomainError(t("T-2289", { rubro: removed[0]?.name ?? "" }), "lines");
    }
    await ctx.tx.delete(budgetLine).where(inArray(budgetLine.id, ids));
  }
  for (const [index, line] of lines.entries()) {
    const values = { name: line.name, assigned: line.assigned, sortOrder: line.sortOrder || index };
    if (line.id && current.some((row) => row.id === line.id)) {
      await ctx.tx.update(budgetLine).set(values).where(eq(budgetLine.id, line.id));
    } else {
      await ctx.tx.insert(budgetLine).values({ budgetId, ...values });
    }
  }
  await ctx.audit({
    action: "budget.lines-set",
    entityType: "committee_budget",
    entityId: budgetId,
    before: current.map(({ id, name, assigned }) => ({ id, name, assigned })),
    after: lines,
  });
}

/** Aprobación de Desarrollo Estudiantil o de la Vicepresidencia Financiera (Regl. art. 50 par. 1). */
export async function approveBudget(
  ctx: CommandContext,
  id: string,
  input: ApproveBudgetInput,
): Promise<void> {
  await lockBudget(ctx, id);
  const patch =
    input.approver === "STUDENT_DEVELOPMENT"
      ? { studentDevelopmentApprovedOn: input.on }
      : { vpFinanceApprovedOn: input.on };
  await ctx.tx.update(committeeBudget).set(patch).where(eq(committeeBudget.id, id));
  await ctx.audit({
    action: "budget.approved",
    entityType: "committee_budget",
    entityId: id,
    after: { approver: input.approver, on: input.on },
  });
}

export async function openBudget(ctx: CommandContext, id: string): Promise<void> {
  const budget = await lockBudget(ctx, id);
  if (budget.status === "OPEN") {
    return;
  }
  const [lines] = await ctx.tx
    .select({ n: count() })
    .from(budgetLine)
    .where(eq(budgetLine.budgetId, id));
  const error = canOpen({ ...budget, lines: lines?.n ?? 0 });
  if (error) {
    throw new DomainError(t(error));
  }
  await ctx.tx.update(committeeBudget).set({ status: "OPEN" }).where(eq(committeeBudget.id, id));
  await ctx.audit({
    action: "budget.opened",
    entityType: "committee_budget",
    entityId: id,
    before: { status: budget.status },
    after: { status: "OPEN" },
  });
}

export async function closeBudget(ctx: CommandContext, id: string): Promise<void> {
  const budget = await lockBudget(ctx, id);
  if (budget.status === "CLOSED") {
    return;
  }
  await ctx.tx.update(committeeBudget).set({ status: "CLOSED" }).where(eq(committeeBudget.id, id));
  await ctx.audit({
    action: "budget.closed",
    entityType: "committee_budget",
    entityId: id,
    before: { status: budget.status },
    after: { status: "CLOSED" },
  });
}

/** Sanción por presentación tardía (Regl. art. 66): ajuste porcentual sobre lo asignado, con motivo. */
export async function sanctionBudget(
  ctx: CommandContext,
  id: string,
  raw: SanctionBudgetInput,
): Promise<void> {
  const input = sanctionBudgetSchema.parse(raw);
  const budget = await lockBudget(ctx, id);
  await ctx.tx
    .update(committeeBudget)
    .set({ sanctionPercent: input.percent, sanctionReason: input.reason })
    .where(eq(committeeBudget.id, id));
  await ctx.audit({
    action: "budget.sanctioned",
    entityType: "committee_budget",
    entityId: id,
    before: { sanctionPercent: budget.sanctionPercent, sanctionReason: budget.sanctionReason },
    after: input,
  });
}

export interface PrerequestView {
  id: string;
  month: string;
  submittedOn: string;
  notes: string;
}

export interface ApprovalView {
  id: string;
  title: string;
  description: string;
  eventOn: string;
  status: (typeof eventApproval.$inferSelect)["status"];
  decisionNote: string;
  requestedAt: Date;
  decidedAt: Date | null;
  editionId: string | null;
}

export interface ExpenseView {
  id: string;
  lineId: string;
  lineName: string;
  spentOn: string;
  amount: number;
  description: string;
  supplier: string;
  approvalTitle: string | null;
}

export interface TransferView {
  id: string;
  fromLineName: string;
  toLineName: string;
  amount: number;
  reason: string;
  approvalTitle: string | null;
  createdAt: Date;
}

export interface BudgetSummary {
  budget: BudgetListRow;
  lines: LineSummary[];
  rawLines: BudgetLineRow[];
  totals: BudgetTotals;
  prerequests: PrerequestView[];
  approvals: ApprovalView[];
  expenses: ExpenseView[];
  transfers: TransferView[];
}

/** Todo lo de un presupuesto para el detalle de ADMIN y el área Finanzas del comité. */
export async function getBudgetSummary(id: string): Promise<BudgetSummary | null> {
  const budget = await getBudget(id);
  if (!budget) {
    return null;
  }
  const db = getDb();
  const [rawLines, expenses, transfers, prerequests, approvals] = await Promise.all([
    db
      .select()
      .from(budgetLine)
      .where(eq(budgetLine.budgetId, id))
      .orderBy(asc(budgetLine.sortOrder), asc(budgetLine.name)),
    db
      .select()
      .from(budgetExpense)
      .where(eq(budgetExpense.budgetId, id))
      .orderBy(desc(budgetExpense.spentOn), desc(budgetExpense.createdAt)),
    db
      .select()
      .from(budgetTransfer)
      .where(eq(budgetTransfer.budgetId, id))
      .orderBy(desc(budgetTransfer.createdAt)),
    db
      .select()
      .from(budgetPrerequest)
      .where(eq(budgetPrerequest.budgetId, id))
      .orderBy(desc(budgetPrerequest.month)),
    db
      .select()
      .from(eventApproval)
      .where(eq(eventApproval.committeeId, budget.committeeId))
      .orderBy(desc(eventApproval.requestedAt)),
  ]);
  const lineName = new Map(rawLines.map((line) => [line.id, line.name]));
  const approvalTitle = new Map(approvals.map((item) => [item.id, item.title]));
  const lines = summarizeLines(rawLines, expenses, transfers, budget.sanctionPercent);
  return {
    budget,
    lines,
    rawLines,
    totals: totalsOf(lines),
    prerequests: prerequests.map(({ id, month, submittedOn, notes }) => ({
      id,
      month,
      submittedOn,
      notes,
    })),
    approvals: approvals.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      eventOn: item.eventOn,
      status: item.status,
      decisionNote: item.decisionNote,
      requestedAt: item.requestedAt,
      decidedAt: item.decidedAt,
      editionId: item.editionId,
    })),
    expenses: expenses.map((item) => ({
      id: item.id,
      lineId: item.lineId,
      lineName: lineName.get(item.lineId) ?? "",
      spentOn: item.spentOn,
      amount: item.amount,
      description: item.description,
      supplier: item.supplier,
      approvalTitle: item.approvalId ? (approvalTitle.get(item.approvalId) ?? null) : null,
    })),
    transfers: transfers.map((item) => ({
      id: item.id,
      fromLineName: lineName.get(item.fromLineId) ?? "",
      toLineName: lineName.get(item.toLineId) ?? "",
      amount: item.amount,
      reason: item.reason,
      approvalTitle: item.approvalId ? (approvalTitle.get(item.approvalId) ?? null) : null,
      createdAt: item.createdAt,
    })),
  };
}

export function budgetKindLabel(kind: BudgetRow["kind"]): string {
  return tList("T-2286")[BUDGET_KINDS.indexOf(kind)] ?? kind;
}

export function budgetStatusLabel(status: BudgetRow["status"]): string {
  return tList("T-2202")[BUDGET_STATUSES.indexOf(status)] ?? status;
}
