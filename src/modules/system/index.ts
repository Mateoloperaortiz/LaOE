// API pública del módulo system: lo que otros módulos y src/app pueden usar.
export {
  type ConfigKey,
  type ConfigValue,
  getConfig,
  requireConfig,
  setConfig,
} from "./domain/config";
export { recordExport } from "./domain/exports";
export { checkDatabase } from "./domain/health";
export { type BackupStatus, checkBackup, pruneOutbox } from "./domain/maintenance";
export { listOutbox, type OutboxRow, type OutboxState, retryDeadLetter } from "./domain/outbox";
