// API pública del módulo participation (ADR-035, ADR-038).

export { listAgendaForPerson, type PersonAgendaContext } from "./domain/agenda";
export {
  type AgendaEdition,
  type AgendaEntry,
  type AgendaOccasion,
  agendaEntries,
} from "./domain/agenda-pure";
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
  type ExcuseInput,
  excuseCheckIn,
  findCheckIn,
  listApprovedCheckInsForPersonInTerm,
  listApprovedCheckInsForTerm,
  listCheckIns,
  listCheckInsForPerson,
  listExcusedCheckInsForPersonInTerm,
  listExcusedCheckInsForTerm,
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
export {
  type AssemblyRepresentation,
  type CommitteeRepresentationSummary,
  listAssemblyRepresentation,
  listCommitteeRepresentation,
  MAX_EXCUSED_ABSENCES,
  type RepresentationLadder,
  recomputeCommitteeAssembly,
  representationLadder,
} from "./domain/committee-assembly";
export { type CommitteeViability, listCommitteeViability } from "./domain/committee-viability";
export {
  VIABILITY_ALERTS,
  type ViabilityAlert,
  type ViabilityInput,
  viabilityAlerts,
} from "./domain/committee-viability-pure";
export { type CheckInExportRow, listCheckInsForExport } from "./domain/exports";
export {
  audienceIncludes,
  badgeProgress,
  boosterExpiresAt,
  boosterPercent,
  boosterState,
  challengeState,
  computeReward,
  dayKeyFor,
  GAMIFICATION_TIMEZONE,
  gradeTrivia,
  isVoluntaryOccasion,
  memberChallengeStatus,
  unlockedLevel,
  weekKeyFor,
} from "./domain/gamification-pure";
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
export {
  countPendingGamification,
  grantReward,
  type ReserveRewardInput,
  type RewardRow,
  releaseReward,
  reserveAndGrantReward,
  reserveReward,
  reverseReward,
  usedRewardPoints,
} from "./domain/rewards";
export { rotatingCodeAt, secondsUntilRotation } from "./domain/rotating-code-pure";
export {
  type CommitteeOccasionScore,
  type CommitteeParticipationRow,
  listCommitteeScores,
  listOccasionScores,
} from "./domain/scores";
export {
  type AnswerSurveyResult,
  answerSurveyAs,
  type CommitteeSurveys,
  type CreatedInvite,
  createSurveyInvites,
  getSurveyInviteForActor,
  type OccasionSurveySummary,
  type SurveyInviteState,
  surveySummary,
  surveySummaryForCommittee,
} from "./domain/surveys";
export {
  type QuestionSummary,
  SURVEY_TEXT_MIN,
  type SurveySummary,
  summarizeAnswers,
} from "./domain/surveys-pure";
export {
  getTodayWordle,
  listWordleGamesFor,
  startWordleAs,
  submitWordleGuessAs,
} from "./domain/wordle";
export type {
  BadgeFamily,
  BoosterKind,
  BoosterState,
  BoosterStoredStatus,
  CampaignPercent,
  ChallengeAudience,
  ChallengeKind,
  ChallengeState,
  ChallengeStoredStatus,
  EvidenceFileStatus,
  MemberChallengeStatus,
  ParticipationStatus,
  PersonalPercent,
  RewardBreakdown,
  RewardCaps,
  RewardSource,
  RewardStatus,
} from "./gamification-types";
export {
  BADGE_FAMILIES,
  BOOSTER_KINDS,
  BOOSTER_STATES,
  CHALLENGE_AUDIENCES,
  CHALLENGE_KINDS,
  MEMBER_CHALLENGE_STATUSES,
  PARTICIPATION_STATUSES,
} from "./gamification-types";
export type {
  SubmitWordleInput,
  TodayWordle,
  WordleAttemptView,
  WordleDenial,
  WordleGameView,
  WordleLetterState,
  WordleResult,
  WordleStatus,
} from "./wordle-types";
