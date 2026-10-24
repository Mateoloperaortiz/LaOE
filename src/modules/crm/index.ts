// API pública del módulo crm.

export {
  applyToCallAs,
  decideEntryAs,
  getCall,
  listCallEntries,
  listMyEntries,
  listOpenCalls,
  setCallStatusAs,
} from "./domain/calls";
export {
  CALL_ENTRY_STATUSES,
  CALL_SELECTIONS,
  CALL_STATUSES,
} from "./domain/calls-pure";
export {
  addCardNoteAs,
  admitFromCardAs,
  cardInputSchema,
  cardTaskInputSchema,
  cardUpdateSchema,
  createCardAs,
  createCardTaskAs,
  getBoard,
  getCard,
  listCardsByOrganization,
  listCardsByPerson,
  moveCardAs,
  updateCardAs,
} from "./domain/cards";
export {
  addNoteAs,
  addOrganizationNoteAs,
  completePersonTaskAs,
  createTaskAs,
  editNoteAs,
  markOnboardingStepAs,
} from "./domain/commands";
export { dashboardForAdmin } from "./domain/dashboard";
export { type ExcuseState, listExcuseStates } from "./domain/excuse-states";
export {
  type InteractionView,
  latestContact,
  listInteractions,
  listOrganizationInteractions,
  type TimelineFilter,
} from "./domain/interactions";
export {
  getOnboarding,
  recordOnboardingEvidence,
} from "./domain/onboarding";
export {
  addContactAs,
  createExternalContactAs,
  createOrganizationAs,
  externalContactSchema,
  getOrganization,
  listContacts,
  listOrganizationOptions,
  listOrganizationsOfPerson,
  listOrganizationTagIds,
  ORGANIZATION_KINDS,
  removeContactAs,
  searchOrganizations,
  setOrganizationTagsAs,
  setPrimaryContactAs,
  updateOrganizationAs,
} from "./domain/organizations";
export { collectOwnCrmData } from "./domain/own-data";
export {
  deleteStageAs,
  getPipeline,
  listAdmissionPipelineIds,
  listPipelineOptions,
  listStages,
  moveStageAs,
  saveStageAs,
  stageInputSchema,
} from "./domain/pipelines";
export {
  PIPELINE_KINDS,
  templateStages,
} from "./domain/pipelines-pure";
export {
  grantRecognitionAs,
  listCommitteeRecognitions,
  listRecognitionsByPeople,
  listRecognitionsFor,
  MONTHS,
  monthName,
  OE_AWARDS,
  type RecognitionView,
  recognitionInputSchema,
} from "./domain/recognitions";
export {
  countPendingRequests,
  createRequestAs,
  decideExcuseForCommitteeAs,
  decideRequestAs,
  excuseDeadline,
  getRequest,
  getRequestByTask,
  listPendingExcusesForCommittee,
  listRequests,
  listRequestsByPerson,
  type RequestView,
  requestKindLabel,
  withdrawRequestAs,
} from "./domain/requests";
export {
  EXCUSE_CAUSES,
  REQUEST_KINDS,
  REQUEST_PAYLOAD_SCHEMAS,
  REQUEST_STATUSES,
  type RequestKind,
} from "./domain/requests-pure";
export {
  countOpenTasksFor,
  listTasks,
  type TaskRow,
  taskInputSchema,
} from "./domain/tasks";
export type { InteractionKind } from "./schema";
