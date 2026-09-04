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
export { getOnboarding, type OnboardingStep } from "./domain/onboarding";
export {
  countOpenTasksFor,
  listTasks,
  type TaskInput,
  type TaskRow,
  taskInputSchema,
} from "./domain/tasks";
export type { InteractionKind } from "./schema";
