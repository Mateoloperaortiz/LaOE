// API pública del módulo finance (ADR-059, ADR-060 regla 12): presupuestos, rubros, presolicitudes,
// avales de evento, gastos y traslados. Lo usan src/app y nadie más.
export {
  approvalRequestSchema,
  approvalStatusLabel,
  type EventApprovalListRow,
  listEventApprovals,
} from "./domain/approvals";
export {
  APPROVERS,
  LATE_BUDGET_SANCTION_PERCENT,
} from "./domain/budget-pure";
export {
  approveBudgetSchema,
  type BudgetSummary,
  budgetKindLabel,
  budgetLinesInputSchema,
  budgetStatusLabel,
  getBudget,
  getBudgetSummary,
  listCommitteeBudgets,
  sanctionBudgetSchema,
} from "./domain/budgets";
export {
  approveBudgetAs,
  closeBudgetAs,
  decideEventApprovalAs,
  openBudgetAs,
  recordExpenseAs,
  recordTransferAs,
  requestEventApprovalAs,
  sanctionBudgetAs,
  setBudgetLinesAs,
  submitPrerequestAs,
} from "./domain/commands";
export {
  expenseInputSchema,
  prerequestInputSchema,
  transferInputSchema,
} from "./domain/movements";
