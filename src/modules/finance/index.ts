// API pública del módulo finance (ADR-059, ADR-060 regla 12): presupuestos, rubros, presolicitudes,
// avales de evento, gastos y traslados. Lo usan src/app y nadie más.

export {
  approvalRequestSchema,
  approvalStatusLabel,
  approvalVersionSchema,
  approvedEventForCommittee,
  type EventApprovalDetail,
  type EventApprovalListRow,
  getEventApprovalDetail,
  listEventApprovals,
  riskLevelLabel,
} from "./domain/approvals";
export {
  decideFinancialApprovalAs,
  pendingFinancialApprovals,
  proposalTitle,
  requestExtraordinaryAs,
  requestTransferAs,
} from "./domain/budget-approvals";
export {
  APPROVERS,
  byRisk,
  LATE_BUDGET_SANCTION_PERCENT,
  RISK_LEVELS,
  type RiskLevel,
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
  changeEventApprovalRiskAs,
  closeBudgetAs,
  decideEventApprovalAs,
  openBudgetAs,
  requestEventApprovalAs,
  resubmitEventApprovalAs,
  returnEventApprovalAs,
  sanctionBudgetAs,
  setBudgetLinesAs,
  submitPrerequestAs,
} from "./domain/commands";
export {
  CONTRACT_FILE_MAX_BYTES,
  contractFileUrl,
  contractRequestSchema,
  contractStatusLabel,
  contractUploadSchema,
  decideContractAs,
  listContracts,
  prepareContractUpload,
  requestContractAs,
} from "./domain/contracts";
export {
  prerequestInputSchema,
  purchaseRequestSchema,
  transferInputSchema,
} from "./domain/movements";
export {
  purchasePaymentSchema,
  recordPurchasePaymentAs,
  requestPurchaseAs,
} from "./domain/purchases";
export { CONTRACT_FILE_SLOTS } from "./schema";
