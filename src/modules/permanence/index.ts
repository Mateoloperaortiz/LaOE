// API pública del módulo permanence (ADR-036): lecturas, cálculo y, tramo a tramo, comandos.
export { loadPeopleFacts, loadPermanenceConfig, loadRules, loadTermFacts } from "./domain/facts";
export { type GroupRef, listMyGroupRoles, type MyGroupRoles } from "./domain/groups";
export {
  APPLIES_TO,
  type AppliesTo,
  COMPUTATIONS,
  type Computation,
  GROUP_MODES,
  type Rule,
  type RuleInput,
  type RuleInputValues,
  ruleInputSchema,
  SCOPES,
  WORK_GROUP_KINDS,
  type WorkGroupKind,
} from "./domain/params";
export {
  type CommitteeResult,
  type Condition,
  type CriterionResult,
  computePerson,
  deviatesFromNominal,
  distribution,
  evaluationWindow,
  type FinalState,
  type MandatoryView,
  type Notice,
  noticesFor,
  type PermanenceState,
  type PersonPermanence,
  type Proposal,
  proposeDecisions,
  tableSums,
} from "./domain/permanence-pure";
export {
  applyTemplateAs,
  commentTableAs,
  copyFromPreviousTermAs,
  createRuleAs,
  deleteRuleAs,
  type EditorContext,
  getRule,
  getTableView,
  type ImpactPreview,
  listTableViews,
  lockAllCommitteeTablesAs,
  previewImpact,
  setTableLockAs,
  type TableRef,
  type TableView,
  updateRuleAs,
} from "./domain/rules";
export { parseGeneral, parseMandatory, parseResults } from "./domain/snapshot-pure";
export { getSnapshot, type SnapshotView } from "./domain/snapshots";
export { referenceCommitteeRules, referenceGeneralRules } from "./domain/templates";
