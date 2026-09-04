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
  type CheckInDecision,
  type CheckInOutcome,
  type CheckInSource,
  type CheckInStatus,
} from "./domain/check-in-pure";
export {
  type CheckInRow,
  findCheckIn,
  listCheckIns,
  listCheckInsForPerson,
  type SelfCheckInDenial,
  type SelfCheckInResult,
} from "./domain/check-ins";
export {
  adjustPointsAs,
  cancelOccasionAs,
  checkInSelfAs,
  closeOccasionAs,
  createOccasionAs,
  decideCheckInAs,
  decideManyAs,
  hostCheckInAs,
  openOccasionAs,
  resolveOccasionContext,
  reverseEntryAs,
  rotateSecretAs,
  setRotatingCodeAs,
  updateOccasionAs,
} from "./domain/commands";
export {
  balanceFor,
  type LedgerListRow,
  listEntriesFor,
  listEntriesForPerson,
  listLedger,
  type PointEntryRow,
} from "./domain/ledger";
export {
  balance,
  competitionRanks,
  type Level,
  levelFor,
  POINT_ENTRY_KINDS,
  type PointEntryKind,
  type Ranked,
} from "./domain/ledger-pure";
export { buildLiveSnapshot, checkInLink, type LiveCheckIn, type LiveSnapshot } from "./domain/live";
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
  getOccasionsByIds,
  listMemberAgenda,
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
export {
  type Board,
  type CommitteeScore,
  type MyPosition,
  myPosition,
  type RankedPerson,
  rankCommittees,
  rankPeople,
} from "./domain/rankings";
export { rotatingCodeAt, secondsUntilRotation } from "./domain/rotating-code-pure";
export { type CommitteeParticipationRow, listOccasionScores } from "./domain/scores";
