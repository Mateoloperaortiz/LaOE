// API pública del módulo system: lo que otros módulos y src/app pueden usar.
export {
  createAlias,
  getAlias,
  type LegacyAliasRow,
  listAliases,
  resolveAlias,
} from "./domain/aliases";
export { listEntityAuditFacts, redactAuditEntries } from "./domain/audit";
export {
  type ConfigKey,
  type ConfigValue,
  clearConfigCache,
  getConfig,
  readConfigNow,
  requireConfig,
  requireConfigIn,
  resetConfig,
  reviseConfig,
  setConfig,
  setConfigAs,
  writeConfig,
} from "./domain/config";
export { recordExport, recordSelfExport } from "./domain/exports";
export { checkDatabase } from "./domain/health";
export {
  createImportJob,
  getImportJob,
  type ImportJobRow,
  type ImportJobType,
  listImportJobs,
  takeImportJobApplied,
  takeImportJobInPreview,
  updateImportJob,
} from "./domain/imports";
export { checkBackup, getBackupStatus } from "./domain/maintenance";
export { countDeadLetters, listOutbox, type OutboxRow, retryDeadLetterAs } from "./domain/outbox";
export { collectOwnAuditData } from "./domain/own-data";
export {
  getPrivacyPolicyState,
  PrivacyPolicyPendingError,
  requirePrivacyPolicyVersion,
  setPrivacyPolicyVersionAs,
} from "./domain/privacy";
export { isPrivacyPolicyReady, privacyPolicyVersionSchema } from "./domain/privacy-pure";
