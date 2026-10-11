import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { formatDate, todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { formatMoney } from "@/shared/lib/money";
import { scopeId } from "@/shared/lib/scope-id";
import {
  budgetExpense,
  budgetLine,
  budgetPrerequest,
  budgetTransfer,
  committeeBudget,
  eventApproval,
} from "../schema";
import { availableOf, monthKey } from "./budget-pure";

// Movimientos del Financiero (ADR-059 regla 3; ADR-060 regla 12): presolicitud mensual, gasto y
// traslado sobre un presupuesto abierto, sin superar el disponible, ligados al aval del evento cuando
// lo hay. Nada se edita ni se borra: un error se corrige con un movimiento contrario, con motivo.

const money = z.coerce.number().positive().max(1_000_000_000_000);

export const prerequestInputSchema = z.object({
  budgetId: z.string().trim().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  submittedOn: z.iso.date().optional(),
  notes: z.string().trim().max(1000).default(""),
});

export type PrerequestInput = z.input<typeof prerequestInputSchema>;

export const expenseInputSchema = z.object({
  budgetId: z.string().trim().min(1),
  lineId: z.string().trim().min(1),
  spentOn: z.iso.date(),
  amount: money,
  description: z.string().trim().min(2).max(500),
  supplier: z.string().trim().max(200).default(""),
  approvalId: z.string().trim().min(1).optional(),
});

export type ExpenseInput = z.input<typeof expenseInputSchema>;

export const transferInputSchema = z.object({
  budgetId: z.string().trim().min(1),
  fromLineId: z.string().trim().min(1),
  toLineId: z.string().trim().min(1),
  amount: money,
  reason: z.string().trim().min(2).max(500),
  approvalId: z.string().trim().min(1).optional(),
});

export type TransferInput = z.input<typeof transferInputSchema>;

/** Desde dónde se registra un movimiento: la página de finanzas de un comité (ADR-122 regla 1). */
export interface MovementScope {
  committeeId: string;
}

/**
 * El presupuesto abierto del comité de la página, tomado. El alcance es obligatorio (ADR-122
 * regla 1) y va en la consulta: el presupuesto de otro comité responde como uno que no existe, y no
 * se toma.
 */
async function openBudgetOf(ctx: CommandContext, budgetId: string, scope: MovementScope) {
  // Falla cerrado: sin el comité de la página no hay presupuesto sobre el que registrar.
  const committeeId = scopeId(scope, "committeeId");
  if (committeeId === null) {
    throw new DomainError(t("T-032"));
  }
  const [budget] = await ctx.tx
    .select()
    .from(committeeBudget)
    .where(and(eq(committeeBudget.id, budgetId), eq(committeeBudget.committeeId, committeeId)))
    .for("update");
  if (!budget) {
    throw new DomainError(t("T-032"));
  }
  if (budget.status !== "OPEN") {
    throw new DomainError(t("T-2204", { año: budget.year }));
  }
  return budget;
}

/** El aval debe estar aprobado y ser del comité del presupuesto (Regl. art. 35 par. 1). */
async function approvedApproval(
  ctx: CommandContext,
  approvalId: string,
  budget: typeof committeeBudget.$inferSelect,
) {
  const [row] = await ctx.tx
    .select()
    .from(eventApproval)
    .where(eq(eventApproval.id, approvalId))
    .limit(1);
  if (
    !row ||
    row.status !== "APPROVED" ||
    row.committeeId !== budget.committeeId ||
    (row.budgetId !== null && row.budgetId !== budget.id) ||
    Number(row.eventOn.slice(0, 4)) !== budget.year
  ) {
    throw new DomainError(t("T-2294"), "approvalId");
  }
  return row;
}

async function movementsOf(ctx: CommandContext, budgetId: string) {
  const lines = await ctx.tx.select().from(budgetLine).where(eq(budgetLine.budgetId, budgetId));
  const expenses = await ctx.tx
    .select()
    .from(budgetExpense)
    .where(eq(budgetExpense.budgetId, budgetId));
  const transfers = await ctx.tx
    .select()
    .from(budgetTransfer)
    .where(eq(budgetTransfer.budgetId, budgetId));
  return { lines, expenses, transfers };
}

/** Presolicitud del mes (Est. art. 38.3 y par. 1): una por mes y presupuesto; sin ella no hay gasto. */
export async function submitPrerequest(
  ctx: CommandContext,
  raw: PrerequestInput,
  scope: MovementScope,
): Promise<{ id: string }> {
  const input = prerequestInputSchema.parse(raw);
  const budget = await openBudgetOf(ctx, input.budgetId, scope);
  if (Number(input.month.slice(0, 4)) !== budget.year) {
    throw new DomainError(t("T-2329", { año: budget.year }), "month");
  }
  const [existing] = await ctx.tx
    .select({ id: budgetPrerequest.id })
    .from(budgetPrerequest)
    .where(
      and(eq(budgetPrerequest.budgetId, input.budgetId), eq(budgetPrerequest.month, input.month)),
    )
    .limit(1);
  if (existing) {
    throw new DomainError(t("T-2297", { mes: input.month }), "month");
  }
  const values = {
    budgetId: budget.id,
    month: input.month,
    submittedOn: input.submittedOn ?? todayKey(),
    submittedById: ctx.actor.personId,
    notes: input.notes,
  };
  const [row] = await ctx.tx
    .insert(budgetPrerequest)
    .values(values)
    .returning({ id: budgetPrerequest.id });
  if (!row) {
    throw new Error("No se pudo registrar la presolicitud");
  }
  await ctx.audit({
    action: "budget.prerequest",
    entityType: "committee_budget",
    entityId: budget.id,
    after: values,
  });
  return row;
}

export async function recordExpense(
  ctx: CommandContext,
  raw: ExpenseInput,
  scope: MovementScope,
): Promise<{ id: string }> {
  const input = expenseInputSchema.parse(raw);
  const budget = await openBudgetOf(ctx, input.budgetId, scope);
  const month = monthKey(input.spentOn);
  if (Number(input.spentOn.slice(0, 4)) !== budget.year) {
    throw new DomainError(t("T-2329", { año: budget.year }), "spentOn");
  }
  const [prerequest] = await ctx.tx
    .select({ id: budgetPrerequest.id })
    .from(budgetPrerequest)
    .where(and(eq(budgetPrerequest.budgetId, budget.id), eq(budgetPrerequest.month, month)))
    .limit(1);
  if (!prerequest) {
    throw new DomainError(t("T-2292", { mes: month }), "spentOn");
  }
  const { lines, expenses, transfers } = await movementsOf(ctx, budget.id);
  const line = lines.find((item) => item.id === input.lineId);
  if (!line) {
    throw new DomainError(t("T-032"), "lineId");
  }
  const available = availableOf(line.id, lines, expenses, transfers, budget.sanctionPercent);
  if (input.amount > available) {
    throw new DomainError(
      t("T-2196", { rubro: line.name, monto: formatMoney(available) }),
      "amount",
    );
  }
  if (input.approvalId) {
    const approval = await approvedApproval(ctx, input.approvalId, budget);
    if (!approval.decidedAt || todayKey(approval.decidedAt) > input.spentOn) {
      throw new DomainError(t("T-2330"), "approvalId");
    }
  }
  const values = {
    budgetId: budget.id,
    lineId: line.id,
    approvalId: input.approvalId ?? null,
    spentOn: input.spentOn,
    amount: input.amount,
    description: input.description,
    supplier: input.supplier,
    registeredById: ctx.actor.personId,
  };
  const [row] = await ctx.tx
    .insert(budgetExpense)
    .values(values)
    .returning({ id: budgetExpense.id });
  if (!row) {
    throw new Error("No se pudo registrar el gasto");
  }
  await ctx.audit({
    action: "budget.expense",
    entityType: "committee_budget",
    entityId: budget.id,
    after: { ...values, expenseId: row.id },
  });
  return row;
}

export async function recordTransfer(
  ctx: CommandContext,
  raw: TransferInput,
  scope: MovementScope,
  now = new Date(),
): Promise<{ id: string }> {
  const input = transferInputSchema.parse(raw);
  if (input.fromLineId === input.toLineId) {
    throw new DomainError(t("T-2293"), "toLineId");
  }
  const budget = await openBudgetOf(ctx, input.budgetId, scope);
  const { lines, expenses, transfers } = await movementsOf(ctx, budget.id);
  const from = lines.find((item) => item.id === input.fromLineId);
  const to = lines.find((item) => item.id === input.toLineId);
  if (!from || !to) {
    throw new DomainError(t("T-032"), "fromLineId");
  }
  const available = availableOf(from.id, lines, expenses, transfers, budget.sanctionPercent);
  if (input.amount > available) {
    throw new DomainError(
      t("T-2196", { rubro: from.name, monto: formatMoney(available) }),
      "amount",
    );
  }
  if (!input.approvalId) {
    throw new DomainError(t("T-2294"), "approvalId");
  }
  {
    // Las reasignaciones se presentan con el aval y antes del evento (Est. art. 38 par. 2).
    const approval = await approvedApproval(ctx, input.approvalId, budget);
    if (approval.eventOn <= todayKey(now)) {
      throw new DomainError(
        t("T-2295", { fecha: formatDate(new Date(`${approval.eventOn}T12:00:00Z`)) }),
        "approvalId",
      );
    }
  }
  const values = {
    budgetId: budget.id,
    fromLineId: from.id,
    toLineId: to.id,
    approvalId: input.approvalId ?? null,
    amount: input.amount,
    reason: input.reason,
    registeredById: ctx.actor.personId,
  };
  const [row] = await ctx.tx
    .insert(budgetTransfer)
    .values(values)
    .returning({ id: budgetTransfer.id });
  if (!row) {
    throw new Error("No se pudo registrar el traslado");
  }
  await ctx.audit({
    action: "budget.transfer",
    entityType: "committee_budget",
    entityId: budget.id,
    after: { ...values, transferId: row.id },
  });
  return row;
}
