import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import {
  type BoardDecision,
  boardApprovalLabel,
  listCommitteesByIds,
  notifyApproval,
  readBoardDecision,
  requireApprovalAuthority,
  seatDeciders,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { formatExactMoney } from "@/shared/lib/money";
import {
  type BudgetProposal,
  budgetApproval,
  budgetLine,
  budgetTransfer,
  committeeBudget,
} from "../schema";
import { lockBudget, lockCommitteeBudget } from "./budget-lock";
import {
  type MovementScope,
  type TransferInput,
  validatePurchase,
  validateTransfer,
} from "./movements";

type Budget = typeof committeeBudget.$inferSelect;
export type FinancialApproval = typeof budgetApproval.$inferSelect;

export function proposalTitle(p: BudgetProposal) {
  if (p.kind === "PURCHASE") return `${p.description} · ${formatExactMoney(p.amount)}`;
  return p.kind === "EXTRAORDINARY"
    ? p.title
    : `${p.fromName} → ${p.toName} · ${formatExactMoney(p.amount)}`;
}

export async function pendingFinancialApprovals() {
  const rows = await getDb()
    .select()
    .from(budgetApproval)
    .where(eq(budgetApproval.status, "PENDING"))
    .orderBy(asc(budgetApproval.requestedAt), asc(budgetApproval.id));
  const refs = await listCommitteesByIds([...new Set(rows.map((r) => r.committeeId))]);
  const names = new Map(refs.map((r) => [r.id, r.name]));
  return rows.map((r) => ({ ...r, committeeName: names.get(r.committeeId) ?? "" }));
}

export function budgetApprovalHistory(budgetId: string, committeeId: string) {
  return getDb()
    .select()
    .from(budgetApproval)
    .where(and(eq(budgetApproval.budgetId, budgetId), eq(budgetApproval.committeeId, committeeId)))
    .orderBy(desc(budgetApproval.requestedAt));
}

/** El presupuesto ya está tomado. Un doble envío de la misma propuesta conserva su solicitud. */
async function request(
  ctx: CommandContext,
  budget: Budget,
  proposal: Exclude<BudgetProposal, { kind: "PURCHASE" }>,
  now: Date,
) {
  const pending = await ctx.tx
    .select()
    .from(budgetApproval)
    .where(and(eq(budgetApproval.budgetId, budget.id), eq(budgetApproval.status, "PENDING")));
  const existing = pending.find(({ proposal: p }) =>
    proposal.kind === "EXTRAORDINARY"
      ? p.kind === "EXTRAORDINARY"
      : p.kind === "TRANSFER" &&
        p.fromLineId === proposal.fromLineId &&
        p.toLineId === proposal.toLineId &&
        p.amount === proposal.amount &&
        p.reason === proposal.reason &&
        p.approvalId === proposal.approvalId,
  );
  if (existing) return { id: existing.id };
  return submitFinancialApproval(ctx, budget, proposal, now);
}

export async function submitFinancialApproval(
  ctx: CommandContext,
  budget: Budget,
  proposal: BudgetProposal,
  now: Date,
  id?: string,
) {
  const [row] = await ctx.tx
    .insert(budgetApproval)
    .values({
      id,
      budgetId: budget.id,
      committeeId: budget.committeeId,
      year: budget.year,
      proposal,
      requestedById: ctx.actor.personId,
      requestedAt: now,
    })
    .onConflictDoNothing({ target: budgetApproval.id })
    .returning({ id: budgetApproval.id });
  if (!row) throw new DomainError(t("T-5169"));
  await ctx.audit({
    action: "budget-approval.requested",
    entityType: "budget_approval",
    entityId: row.id,
    after: { budgetId: budget.id, proposal },
  });
  const term = await getCurrentTerm(now, ctx.tx);
  const [title] = tList("T-5162");
  if (term)
    await notifyApproval(ctx, await seatDeciders("VP_FINANCE", term.id, ctx.tx), {
      title,
      body: proposalTitle(proposal),
      url: `/admin/avales?finanzas=${row.id}`,
      dedupeKey: `aval-financiero-pedido:${row.id}`,
    });
  return row;
}

export function requestTransferAs(
  actor: Actor,
  input: TransferInput,
  scope: MovementScope,
  now = new Date(),
) {
  return runCommand(actor, async (ctx) => {
    const { budget, proposal } = await validateTransfer(ctx, input, scope, now);
    return request(ctx, budget, proposal, now);
  });
}

export function requestExtraordinaryAs(
  actor: Actor,
  id: string,
  scope: MovementScope,
  now = new Date(),
) {
  return runCommand(actor, async (ctx) => {
    const budget = await lockCommitteeBudget(ctx, id, scope);
    if (
      budget.kind !== "EXTRAORDINARY" ||
      budget.status !== "DRAFT" ||
      budget.vpFinanceApprovedOn ||
      !budget.submittedOn
    )
      throw new DomainError(t("T-5160"));
    const lines = await ctx.tx
      .select({ id: budgetLine.id, name: budgetLine.name, assigned: budgetLine.assigned })
      .from(budgetLine)
      .where(eq(budgetLine.budgetId, id))
      .orderBy(asc(budgetLine.sortOrder), asc(budgetLine.id));
    if (!lines.length) throw new DomainError(t("T-2291"));
    return request(
      ctx,
      budget,
      {
        kind: "EXTRAORDINARY",
        title: budget.title,
        submittedOn: budget.submittedOn,
        notes: budget.notes,
        lines,
      },
      now,
    );
  });
}

/** El comité conserva en el historial la versión que envió a la VP. */
export async function assertNoPendingExtraordinary(ctx: CommandContext, id: string) {
  const rows = await ctx.tx
    .select({ proposal: budgetApproval.proposal })
    .from(budgetApproval)
    .where(and(eq(budgetApproval.budgetId, id), eq(budgetApproval.status, "PENDING")));
  if (rows.some(({ proposal }) => proposal.kind === "EXTRAORDINARY"))
    throw new DomainError(t("T-5161"));
}

export function decideFinancialApprovalAs(
  actor: Actor,
  id: string,
  raw: BoardDecision,
  now = new Date(),
) {
  return runCommand(actor, async (ctx) => {
    const input = readBoardDecision(raw);
    const authority = await requireApprovalAuthority(ctx, "VP_FINANCE", now);
    const [hint] = await ctx.tx
      .select({ budgetId: budgetApproval.budgetId })
      .from(budgetApproval)
      .where(eq(budgetApproval.id, id));
    if (!hint) throw new DomainError(t("T-032"));
    const budget = await lockBudget(ctx, hint.budgetId);
    const [row] = await ctx.tx
      .select()
      .from(budgetApproval)
      .where(eq(budgetApproval.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    if (row.status !== "PENDING") throw new DomainError(t("T-2296"));
    const p = row.proposal;
    let transferId: string | null = null;
    if (input.decision === "APPROVED") {
      if (p.kind === "PURCHASE") {
        await validatePurchase(ctx, budget, p);
      } else if (p.kind === "TRANSFER") {
        await validateTransfer(
          ctx,
          { budgetId: budget.id, ...p },
          { committeeId: row.committeeId },
          now,
        );
        const values = {
          budgetId: budget.id,
          fromLineId: p.fromLineId,
          toLineId: p.toLineId,
          approvalId: p.approvalId,
          amount: p.amount,
          reason: p.reason,
          registeredById: actor.personId,
          createdAt: now,
        };
        const [posted] = await ctx.tx
          .insert(budgetTransfer)
          .values(values)
          .returning({ id: budgetTransfer.id });
        if (!posted) throw new Error("No se pudo registrar el traslado aprobado");
        transferId = posted.id;
        await ctx.audit({
          action: "budget.transfer",
          entityType: "committee_budget",
          entityId: budget.id,
          after: { ...values, transferId, approvalRequestId: id },
        });
      } else {
        if (
          budget.status !== "DRAFT" ||
          budget.kind !== "EXTRAORDINARY" ||
          budget.committeeId !== row.committeeId ||
          budget.vpFinanceApprovedOn
        )
          throw new DomainError(t("T-5160"));
        const on = todayKey(now);
        await ctx.tx
          .update(committeeBudget)
          .set({ vpFinanceApprovedOn: on })
          .where(eq(committeeBudget.id, budget.id));
        await ctx.audit({
          action: "budget.approved",
          entityType: "committee_budget",
          entityId: budget.id,
          after: { approver: "VP_FINANCE", on, approvalRequestId: id },
        });
      }
    }
    const decision = {
      status: input.decision,
      decidedAt: now,
      decidedAs: authority,
      decidedById: actor.personId,
      decisionNote: input.note,
      transferId,
    };
    await ctx.tx.update(budgetApproval).set(decision).where(eq(budgetApproval.id, id));
    await ctx.audit({
      action: "budget-approval.decided",
      entityType: "budget_approval",
      entityId: id,
      before: { status: row.status },
      after: decision,
    });
    if (row.requestedById) {
      const [committee] = await listCommitteesByIds([row.committeeId]);
      const [, title] = tList("T-5162");
      await notifyApproval(ctx, [row.requestedById], {
        title,
        body: `${proposalTitle(p)} · ${boardApprovalLabel(input.decision)}${input.note ? ` · ${input.note}` : ""}`,
        url: committee ? `/admin/comites/${committee.slug}?area=finanzas` : "/admin",
        dedupeKey: `aval-financiero-decidido:${id}`,
      });
    }
  });
}
