// API pública del módulo permanence (ADR-036): lecturas, cálculo y, tramo a tramo, comandos.

export { listAvailabilityWorkGroups } from "./domain/availability";
export { boardExportRows, boardIndicators } from "./domain/board";
export { BOARD_COMMITTEE_STATES, boardComposition } from "./domain/board-composition";
export {
  grantPermanenceBonusAs,
  type PermanenceBonusGroup,
  permanenceBonusInputSchema,
  previewPermanenceBonus,
} from "./domain/bonuses";
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
  closeEditionFollowUpAs,
  editionClosure,
  editionHandovers,
  editionLog,
  editionsPendingClosure,
  listEditionFollowUps,
  myEditionHandovers,
  saveEditionEntryAs,
  saveEditionHandoverAs,
} from "./domain/edition-follow-up";
export {
  countPendingFor,
  evaluateAs,
  evaluationInputSchema,
  listEvaluationTray,
} from "./domain/evaluations";
export { loadPeopleFacts, loadPermanenceConfig, loadRules, loadTermFacts } from "./domain/facts";
export {
  assignCompanionAs,
  isCapMember,
  listCapMembers,
  listCommitteeLog,
  listCompanions,
  roleQuestions,
  saveCapEntryAs,
  saveTemplateAs,
  templateQuestions,
} from "./domain/follow-up";
export { FOLLOW_UP_KINDS, questionsFromText } from "./domain/follow-up-pure";
export {
  addMembersAs,
  applyMemberImportAs,
  createGroupAs,
  evaluatorIdsSchema,
  type GroupRef,
  getGroup,
  getGroupDetail,
  groupJoinBlocker,
  hasCmlMembershipInTerm,
  isOfficeDecorationGroup,
  leadsWorkCommittee,
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
export { mandatoryCounts } from "./domain/mandatory-counts";
export { getPersonPermanence } from "./domain/my-permanence";
export { runNotices } from "./domain/notices";
export { collectOwnPermanenceData } from "./domain/own-data";
export {
  APPLIES_TO,
  COMMITTEE_FILTERS,
  COMPUTATIONS,
  type Computation,
  GROUP_MODES,
  NEW_MEMBERS_FILTERS,
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
export { COMPLIANCE_STATES, parseResults } from "./domain/snapshot-pure";
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
