// API pública del módulo participation (ADR-035).
export {
  type AssemblyCompliance,
  type AssemblyRequirementView,
  assemblyCompliance,
  defaultRequirement,
  requiredTotal,
} from "./domain/assembly-pure";
export {
  CHECK_IN_SOURCES,
  CHECK_IN_STATUSES,
  type CheckInSource,
  type CheckInStatus,
} from "./domain/check-in-pure";
export {
  cancelOccasionAs,
  closeOccasionAs,
  createOccasionAs,
  openOccasionAs,
  resolveOccasionContext,
  rotateSecretAs,
  setRotatingCodeAs,
  updateOccasionAs,
} from "./domain/commands";
export {
  balance,
  competitionRanks,
  type Level,
  levelFor,
  POINT_ENTRY_KINDS,
} from "./domain/ledger-pure";
export {
  ASSEMBLY_KINDS,
  type AssemblyKind,
  canOpenOccasion,
  OCCASION_CATEGORIES,
  OCCASION_KINDS,
  OCCASION_STATUSES,
  type OccasionCategory,
  type OccasionKind,
  type OccasionStatus,
  type WindowState,
  windowState,
} from "./domain/occasion-pure";
export {
  countApproved,
  countOpenOccasions,
  getOccasion,
  getOccasionByPublicId,
  listOccasions,
  listOccasionsForTerm,
  type OccasionInput,
  type OccasionListRow,
  type OccasionRef,
  type OccasionRow,
  occasionInputSchema,
  searchOccasions,
} from "./domain/occasions";
export { isPublicId, PUBLIC_ID } from "./domain/public-id-pure";
export { rotatingCodeAt, secondsUntilRotation } from "./domain/rotating-code-pure";
