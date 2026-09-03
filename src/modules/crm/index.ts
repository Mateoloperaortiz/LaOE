// API pública del módulo crm.
export { addNoteAs, completeTaskAs, createTaskAs, editNoteAs } from "./domain/commands";
export {
  type InteractionView,
  latestContact,
  listInteractions,
  type TimelineFilter,
} from "./domain/interactions";
export {
  countOpenTasksFor,
  listTasks,
  type TaskInput,
  type TaskRow,
  taskInputSchema,
} from "./domain/tasks";
export type { InteractionKind } from "./schema";
