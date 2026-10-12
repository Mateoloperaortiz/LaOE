// API pública del módulo permanence (ADR-036): lecturas, cálculo y, tramo a tramo, comandos.

export { boardExportRows, boardIndicators } from "./domain/board";
export {
  applyDecisions,
  CLOSING_FILTERS,
  type ClosingFilter,
  type ClosingPersonRow,
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  decisionInputSchema,
  filterClosingRows,
  listClosingRows,
  listPersonDecisions,
} from "./domain/closing";
export {
  COMPLIANCE_FILTERS,
  type ComplianceFilter,
  complianceSummary,
  listCompliance,
} from "./domain/compliance";
export {
  countPendingFor,
  evaluateAs,
  evaluationInputSchema,
  listEvaluationTray,
} from "./domain/evaluations";
export { loadPeopleFacts, loadPermanenceConfig, loadRules, loadTermFacts } from "./domain/facts";
export {
  addMembersAs,
  applyMemberImportAs,
  createGroupAs,
  type GroupRef,
  getGroup,
  getGroupDetail,
  groupJoinBlocker,
  listGroupIdsOf,
  listGroupOptions,
  listGroupRefs,
  listGroups,
  listMyGroupRoles,
  listWorkCommitteeTermIds,
  previewMemberImport,
  removeMemberAs,
  seedWorkCommitteesAs,
  setEvaluatorsAs,
  type WorkGroupRow,
} from "./domain/groups";
export {
  grantManualCreditAs,
  leaderScoreInputSchema,
  listLeaderScores,
  listManualCredits,
  manualCreditInputSchema,
  scoreCriterionAs,
} from "./domain/leader-scores";
export {
  configureMacroeventGroupAs,
  findMacroeventGroup,
  prepareMacroeventGroupAs,
} from "./domain/macroevents";
export { getPersonPermanence } from "./domain/my-permanence";
export { runNotices } from "./domain/notices";
export {
  type Computation,
  type Rule,
  type RuleInputValues,
  ruleInputSchema,
  WORK_GROUP_KINDS,
  type WorkGroupKind,
} from "./domain/params";
export {
  type CommitteeResult,
  type CriterionResult,
  computePerson,
  deviatesFromNominal,
  evaluationWindow,
  type MandatoryView,
  type Notice,
  type PersonPermanence,
} from "./domain/permanence-pure";
export {
  applyTemplateAs,
  commentTableAs,
  copyFromPreviousTermAs,
  createRuleAs,
  deleteRuleAs,
  getTableView,
  listTableViews,
  lockAllCommitteeTablesAs,
  previewImpact,
  setTableLockAs,
  type TableRef,
  type TableView,
  updateRuleAs,
} from "./domain/rules";
export { parseResults } from "./domain/snapshot-pure";
export {
  freezeSnapshots,
  getSnapshot,
  listSnapshots,
  recomputeSnapshots,
  requestRecomputeAs,
} from "./domain/snapshots";
export { macroeventAreas, teamAreaLabel } from "./domain/team-areas";
export {
  listTeamParticipations,
  saveMacroeventMemberAs,
  teamMemberInputSchema,
} from "./domain/team-members";
export { referenceCommitteeRules, referenceGeneralRules } from "./domain/templates";
