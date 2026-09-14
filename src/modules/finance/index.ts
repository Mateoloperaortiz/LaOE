// API pública del módulo finance (ADR-059, ADR-060 regla 12): presupuestos, rubros, presolicitudes,
// avales de evento, gastos y traslados. Lo usan src/app y nadie más.
export {
  type ApprovalRequestInput,
  approvalDecisionSchema,
  approvalRequestSchema,
  approvalStatusLabel,
  type EventApprovalListRow,
  listEventApprovals,
} from "./domain/approvals";
export {
  APPROVAL_STATUSES,
  APPROVERS,
  BUDGET_KINDS,
  BUDGET_STATUSES,
  LATE_BUDGET_SANCTION_PERCENT,
  type LineSummary,
} from "./domain/budget-pure";
export {
  approveBudgetSchema,
  type BudgetListRow,
  type BudgetSummary,
  budgetInputSchema,
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
