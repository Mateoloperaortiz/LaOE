// API pública del módulo system: lo que otros módulos y src/app pueden usar.
export {
  ALIAS_PATH,
  createAlias,
  getAlias,
  type LegacyAliasRow,
  listAliases,
  resolveAlias,
} from "./domain/aliases";
export { redactAuditEntries } from "./domain/audit";
export {
  type ConfigKey,
  type ConfigValue,
  getConfig,
  requireConfig,
  setConfig,
} from "./domain/config";
export { recordExport, recordSelfExport } from "./domain/exports";
export { checkDatabase } from "./domain/health";
export {
  createImportJob,
  getImportJob,
  type ImportJobRow,
  type ImportJobStatus,
  listImportJobs,
  updateImportJob,
} from "./domain/imports";
export { type BackupStatus, checkBackup, pruneOutbox } from "./domain/maintenance";
export { listOutbox, type OutboxRow, type OutboxState, retryDeadLetter } from "./domain/outbox";
