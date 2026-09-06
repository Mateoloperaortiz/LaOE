// API pública del módulo participation (ADR-035).
export {
  type AdjustRequirementInput,
  type AssemblyOverviewRow,
  assemblyOverview,
  assemblyStatusFor,
  listTermAssemblies,
  type PersonAssemblyStatus,
} from "./domain/assemblies";
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
  type ApprovedCheckIn,
  type CheckInRow,
  findCheckIn,
  listApprovedCheckInsForPersonInTerm,
  listApprovedCheckInsForTerm,
  listCheckIns,
  listCheckInsForPerson,
  type SelfCheckInDenial,
  type SelfCheckInResult,
} from "./domain/check-ins";
export {
  closingSummary,
  getTermStanding,
  type StandingCommittee,
  type StandingPerson,
  type TermStandingView,
} from "./domain/closing";
export {
  adjustPointsAs,
  adjustRequirementAs,
  cancelOccasionAs,
  checkInSelfAs,
  closeOccasionAs,
  closeTermPointsAs,
  createOccasionAs,
  createOccasionSeriesAs,
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
export { type CheckInExportRow, listCheckInsForExport } from "./domain/exports";
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
  type SeriesInput,
  searchOccasions,
  weeklyDates,
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
export { type RemindersResult, runReminders } from "./domain/reminders";
export {
  type DueReminder,
  type ReminderHours,
  type ReminderOccasion,
  type ReminderSlot,
  reminderSlots,
} from "./domain/reminders-pure";
export { rotatingCodeAt, secondsUntilRotation } from "./domain/rotating-code-pure";
export {
  type CommitteeOccasionScore,
  type CommitteeParticipationRow,
  listCommitteeScores,
  listOccasionScores,
} from "./domain/scores";
