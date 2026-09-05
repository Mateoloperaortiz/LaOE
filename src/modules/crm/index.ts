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
  completeTaskAs,
  createTaskAs,
  editNoteAs,
  markOnboardingStepAs,
} from "./domain/commands";
export {
  type InteractionView,
  latestContact,
  listInteractions,
  type TimelineFilter,
} from "./domain/interactions";
export {
  getOnboarding,
  type OnboardingEvidence,
  type OnboardingStep,
  recordOnboardingEvidence,
} from "./domain/onboarding";
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
