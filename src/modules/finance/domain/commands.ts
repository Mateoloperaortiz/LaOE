import { type Actor, runCommand } from "@/db/tx";
import {
  type ApprovalDecisionInput,
  type ApprovalRequestInput,
  type ApprovalScope,
  decideEventApproval,
  requestEventApproval,
} from "./approvals";
import {
  type ApproveBudgetInput,
  approveBudget,
  type BudgetInput,
  type BudgetLinesInput,
  closeBudget,
  createBudget,
  openBudget,
  type SanctionBudgetInput,
  sanctionBudget,
  setBudgetLines,
  updateBudget,
} from "./budgets";
import {
  type ExpenseInput,
  type PrerequestInput,
  recordExpense,
  recordTransfer,
  submitPrerequest,
  type TransferInput,
} from "./movements";

// Comandos del módulo (ADR-003): cada uno corre en runCommand con auditoría; quién puede llamarlos lo
// decide src/app (ADMIN para presupuestos y avales; FINANCE del comité para los movimientos).

export function createBudgetAs(actor: Actor, input: BudgetInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createBudget(ctx, input));
}

export function updateBudgetAs(actor: Actor, id: string, input: BudgetInput): Promise<void> {
  return runCommand(actor, (ctx) => updateBudget(ctx, id, input));
}

export function setBudgetLinesAs(actor: Actor, id: string, input: BudgetLinesInput): Promise<void> {
  return runCommand(actor, (ctx) => setBudgetLines(ctx, id, input));
}

export function approveBudgetAs(
  actor: Actor,
  id: string,
  input: ApproveBudgetInput,
): Promise<void> {
  return runCommand(actor, (ctx) => approveBudget(ctx, id, input));
}

export function openBudgetAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => openBudget(ctx, id));
}

export function closeBudgetAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => closeBudget(ctx, id));
}

export function sanctionBudgetAs(
  actor: Actor,
  id: string,
  input: SanctionBudgetInput,
): Promise<void> {
  return runCommand(actor, (ctx) => sanctionBudget(ctx, id, input));
}

export function submitPrerequestAs(actor: Actor, input: PrerequestInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => submitPrerequest(ctx, input));
}

export function recordExpenseAs(actor: Actor, input: ExpenseInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => recordExpense(ctx, input));
}

export function recordTransferAs(actor: Actor, input: TransferInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => recordTransfer(ctx, input));
}

export function requestEventApprovalAs(
  actor: Actor,
  input: ApprovalRequestInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => requestEventApproval(ctx, input));
}

/** `scope` es el presupuesto de la página desde la que se decide (ADR-122 regla 1). */
export function decideEventApprovalAs(
  actor: Actor,
  id: string,
  input: ApprovalDecisionInput,
  scope: ApprovalScope,
): Promise<void> {
  return runCommand(actor, (ctx) => decideEventApproval(ctx, id, input, scope));
}
