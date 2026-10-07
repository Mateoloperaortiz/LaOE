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
  setConfigAs,
} from "./domain/config";
export { recordExport, recordSelfExport } from "./domain/exports";
export { checkDatabase } from "./domain/health";
export {
  createImportJob,
  getImportJob,
  type ImportJobRow,
  type ImportJobStatus,
  listImportJobs,
  takeImportJobInPreview,
  updateImportJob,
} from "./domain/imports";
export { type BackupStatus, checkBackup, getBackupStatus, pruneOutbox } from "./domain/maintenance";
export {
  countDeadLetters,
  listOutbox,
  type OutboxRow,
  type OutboxState,
  retryDeadLetterAs,
} from "./domain/outbox";
export {
  getPrivacyPolicyState,
  PrivacyPolicyPendingError,
  requirePrivacyPolicyVersion,
  setPrivacyPolicyVersionAs,
} from "./domain/privacy";
export { isPrivacyPolicyReady, privacyPolicyVersionSchema } from "./domain/privacy-pure";
