// API pública del módulo crm.

export {
  CALL_ENTRY_STATUSES,
  CALL_SELECTIONS,
  CALL_STATUSES,
  type CallEntryStatus,
  type CallSelection,
  type CallStatus,
  hasRoom,
  initialEntryStatus,
  isCallOpen,
} from "./domain/calls-pure";
export {
  addNoteAs,
  addOrganizationNoteAs,
  completeTaskAs,
  createTaskAs,
  editNoteAs,
  markOnboardingStepAs,
} from "./domain/commands";
export {
  type InteractionView,
  latestContact,
  listInteractions,
  listOrganizationInteractions,
  type TimelineFilter,
} from "./domain/interactions";
export {
  getOnboarding,
  type OnboardingEvidence,
  type OnboardingStep,
  recordOnboardingEvidence,
} from "./domain/onboarding";
export {
  addContactAs,
  type ContactInput,
  type ContactView,
  contactInputSchema,
  createExternalContactAs,
  createOrganizationAs,
  type ExternalContactInput,
  externalContactSchema,
  getOrganization,
  getOrganizationsByIds,
  listContacts,
  listOrganizationOptions,
  listOrganizationsOfPerson,
  listOrganizationTagIds,
  ORGANIZATION_KINDS,
  type OrganizationInput,
  type OrganizationKind,
  type OrganizationListRow,
  type OrganizationRef,
  organizationInputSchema,
  removeContactAs,
  searchOrganizations,
  setOrganizationTagsAs,
  setPrimaryContactAs,
  updateOrganizationAs,
} from "./domain/organizations";
export { listAdmissionPipelineIds, listPipelineOptions } from "./domain/pipelines";
export {
  closedAtAfterMove,
  daysInStage,
  PIPELINE_KINDS,
  type PipelineKind,
  type StageTemplate,
  templateStages,
} from "./domain/pipelines-pure";
export {
  grantRecognitionAs,
  listCommitteeRecognitions,
  listRecognitionsByPeople,
  MONTHS,
  monthName,
  type RecognitionInput,
  type RecognitionView,
  recognitionInputSchema,
} from "./domain/recognitions";
export {
  type CommitteeChange,
  type LeavePayload,
  leavePayloadSchema,
  REQUEST_KINDS,
  REQUEST_PAYLOAD_SCHEMAS,
  REQUEST_STATUSES,
  type RequestKind,
  type RequestStatus,
  type ResignationPayload,
  resignationPayloadSchema,
  resultingCommittees,
  type TransferPayload,
  transferPayloadSchema,
} from "./domain/requests-pure";
export {
  countOpenTasksFor,
  listTasks,
  type TaskInput,
  type TaskRow,
  taskInputSchema,
} from "./domain/tasks";
export type { InteractionKind } from "./schema";
