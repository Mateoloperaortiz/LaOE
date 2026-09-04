// API pública del módulo crm.
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
  countOpenTasksFor,
  listTasks,
  type TaskInput,
  type TaskRow,
  taskInputSchema,
} from "./domain/tasks";
export type { InteractionKind } from "./schema";
