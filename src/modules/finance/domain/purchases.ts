import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type Actor, runCommand } from "@/db/tx";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { budgetApproval, budgetExpense } from "../schema";
import { submitFinancialApproval } from "./budget-approvals";
import { lockCommitteeBudget } from "./budget-lock";
import { type MovementScope, purchaseRequestSchema, validatePurchase } from "./movements";

export function requestPurchaseAs(
  actor: Actor,
  raw: z.input<typeof purchaseRequestSchema>,
  scope: MovementScope,
  now = new Date(),
) {
  return runCommand(actor, async (ctx) => {
    const input = purchaseRequestSchema.parse(raw);
    const budget = await lockCommitteeBudget(ctx, input.budgetId, scope);
    // El mismo envío conserva su aval incluso después del pago. Dos compras iguales tienen ids propios.
    const [existing] = await ctx.tx
      .select()
      .from(budgetApproval)
      .where(eq(budgetApproval.id, input.requestId));
    if (existing) {
      const p = existing.proposal;
      if (
        existing.budgetId !== budget.id ||
        existing.committeeId !== budget.committeeId ||
        existing.requestedById !== actor.personId ||
        p.kind !== "PURCHASE" ||
        p.lineId !== input.lineId ||
        p.plannedOn !== input.plannedOn ||
        p.amount !== input.amount ||
        p.supplier !== input.supplier ||
        p.description !== input.description ||
        p.approvalId !== input.approvalId
      )
        throw new DomainError(t("T-5169"));
      return { id: existing.id };
    }
    const proposal = await validatePurchase(ctx, budget, input);
    return submitFinancialApproval(ctx, budget, proposal, now, input.requestId);
  });
}

export const purchasePaymentSchema = z.object({
  budgetId: z.string().min(1),
  purchaseId: z.cuid2(),
  paidOn: z.iso.date(),
});

/** El comité registra el pago efectivo con los datos que aprobó la VP. */
export function recordPurchasePaymentAs(
  actor: Actor,
  raw: z.input<typeof purchasePaymentSchema>,
  scope: MovementScope,
  now = new Date(),
) {
  return runCommand(actor, async (ctx) => {
    const input = purchasePaymentSchema.parse(raw);
    const budget = await lockCommitteeBudget(ctx, input.budgetId, scope);
    const [row] = await ctx.tx
      .select()
      .from(budgetApproval)
      .where(
        and(
          eq(budgetApproval.id, input.purchaseId),
          eq(budgetApproval.budgetId, budget.id),
          eq(budgetApproval.committeeId, budget.committeeId),
        ),
      );
    if (!row || row.proposal.kind !== "PURCHASE") throw new DomainError(t("T-032"));
    if (row.status !== "APPROVED" || !row.decidedAt) throw new DomainError(t("T-5167"));
    if (row.expenseId) {
      const [paid] = await ctx.tx
        .select({ id: budgetExpense.id, spentOn: budgetExpense.spentOn })
        .from(budgetExpense)
        .where(eq(budgetExpense.id, row.expenseId));
      if (paid?.spentOn === input.paidOn) return { id: paid.id };
      throw new DomainError(t("T-5170"));
    }
    if (input.paidOn < todayKey(row.decidedAt) || input.paidOn > todayKey(now))
      throw new DomainError(t("T-5168"), "paidOn");
    const p = row.proposal;
    await validatePurchase(ctx, budget, p, input.paidOn);
    const values = {
      budgetId: budget.id,
      lineId: p.lineId,
      approvalId: p.approvalId ?? null,
      spentOn: input.paidOn,
      amount: p.amount,
      description: p.description,
      supplier: p.supplier,
      registeredById: actor.personId,
    };
    const [expense] = await ctx.tx
      .insert(budgetExpense)
      .values(values)
      .returning({ id: budgetExpense.id });
    if (!expense) throw new Error("No se pudo registrar el pago de la compra");
    await ctx.tx
      .update(budgetApproval)
      .set({ expenseId: expense.id })
      .where(eq(budgetApproval.id, row.id));
    await ctx.audit({
      action: "budget.expense",
      entityType: "committee_budget",
      entityId: budget.id,
      after: { ...values, expenseId: expense.id, approvalRequestId: row.id },
    });
    return expense;
  });
}
