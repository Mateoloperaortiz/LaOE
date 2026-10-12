// API pública del módulo participation (ADR-035, ADR-038).

export { listAgendaForPerson } from "./domain/agenda";
export { agendaEntries } from "./domain/agenda-pure";
export {
  assemblyAdjustmentsFor,
  assemblyOverview,
  assemblyStatusFor,
  listTermAssemblies,
} from "./domain/assemblies";
export { termAssemblyRequirement } from "./domain/assembly-pure";
export {
  type AchievementRow,
  awardSpecialBadge,
  awardSpecialBadgesForChallenge,
  awardSpecialBadgesForOccasion,
  type BadgeCollection,
  type BadgeDelta,
  type BadgeFact,
  type BadgeRow,
  badgeFactsFor,
  type CollectionFamily,
  type CollectionLevel,
  collectionFor,
  createSpecialBadge,
  listAchievementsForPerson,
  listBadgeCatalogAdmin,
  listFeaturedBadgesFor,
  listRevokedWithUsedBooster,
  markSeen,
  recomputeBadgesFor,
  type SpecialBadgeInput,
  setFeatured,
  unseenBadgesFor,
} from "./domain/badges";
export {
  type BoostCampaignRow,
  type BoosterAdminRow,
  type BoosterOrigin,
  type BoosterRow,
  type BoosterTarget,
  type BoosterTargetView,
  type BoosterView,
  type CampaignAdminRow,
  type CampaignAdminState,
  type CampaignInput,
  campaignInputSchema,
  cancelCampaign,
  createCampaigns,
  grantBoosterForAchievement,
  grantBoosterManually,
  listActiveCampaignsForMember,
  listBoostersFor,
  listBoostersForTerm,
  listBoosterTargetsForMember,
  listCampaignsAdmin,
  type MemberCampaignView,
  revokeBooster,
  setBoosterTarget,
} from "./domain/boosters";
export {
  ChallengeAlreadySubmitted,
  EVIDENCE_TEXT_MAX,
  EVIDENCE_TEXT_MIN,
  listParticipationsForPerson,
  listPendingReviews,
  type ParticipationRow,
  type PendingReviewRow,
  type SubmitResult,
} from "./domain/challenge-participation";
export {
  type AdminParticipantRow,
  type ChallengeAdminRow,
  type ChallengeInput,
  type ChallengeQuestionRow,
  type ChallengeRow,
  challengeInputSchema,
  type EvidenceFileRow,
  findChallenge,
  getChallengeAdmin,
  getChallengeForMember,
  hasGrantedRewards,
  listChallengesAdmin,
  listChallengesForMember,
  type MemberChallengeCard,
  type MemberChallengeDetail,
  nextChallengeForMember,
} from "./domain/challenges";
export {
  CHECK_IN_SOURCES,
  CHECK_IN_STATUSES,
  type CheckInSource,
  type CheckInStatus,
  type SelfCheckInEligibilityDenial,
  type SelfCheckInFacts,
  selfCheckInEligibilityDenial,
} from "./domain/check-in-pure";
export {
  type CheckInRow,
  excuseCheckIn,
  findCheckIn,
  listApprovedCheckInsForPersonInTerm,
  listApprovedCheckInsForTerm,
  listCheckIns,
  listCheckInsForPerson,
  listExcusedCheckInsForPersonInTerm,
  listExcusedCheckInsForTerm,
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
  reverseEntryAs,
  rotateSecretAs,
  setRotatingCodeAs,
} from "./domain/commands";
export {
  type CommitteeRepresentationSummary,
  listAssemblyRepresentation,
  listCommitteeRepresentation,
  recomputeCommitteeAssembly,
} from "./domain/committee-assembly";
export { listCommitteeViability } from "./domain/committee-viability";
export { VIABILITY_ALERTS } from "./domain/committee-viability-pure";
export {
  deleteEvidenceFor,
  EVIDENCE_KEY_PATTERN,
  EVIDENCE_KEY_PREFIX,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MIN_BYTES,
  EVIDENCE_TYPES,
  listEvidenceFilesFor,
  type PreparedEvidenceUpload,
  prepareEvidenceUpload,
  resolveEvidenceRedirect,
  verifyEvidenceObjects,
} from "./domain/evidence";
export {
  type ChallengeParticipationExportRow,
  listCheckInsForExport,
  listParticipationsForExport,
} from "./domain/exports";
export {
  finishGame2048As,
  getTodayGame2048,
  listGame2048RunsFor,
  startGame2048As,
} from "./domain/game2048";
export {
  annulParticipationAs,
  cancelCampaignAs,
  cancelChallengeAs,
  createCampaignsAs,
  createChallengeAs,
  createSpecialBadgeAs,
  discardEvidenceUploadAs,
  duplicateChallengeAs,
  type EvidenceSubmitInput,
  grantBoosterAs,
  markSeenAs,
  publishChallengeAs,
  type ReviewInput,
  recomputeBadgesForAs,
  resumeReconciliationAs,
  reviewParticipationAs,
  revokeBoosterAs,
  setBoosterTargetAs,
  setFeaturedAs,
  startReconciliationAs,
  submitEvidenceAs,
  submitTriviaAs,
  type TriviaSubmitInput,
  updateChallengeAs,
} from "./domain/gamification-commands";
export { type GamificationOverview, gamificationOverview } from "./domain/gamification-metrics";
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
export { buildLiveSnapshot, checkInLink } from "./domain/live";
export { type GamificationSettings, loadGamificationSettings } from "./domain/member-context";
export {
  ASSEMBLY_KINDS,
  canOpenOccasion,
  OCCASION_CATEGORIES,
  type OccasionCategory,
  type OccasionKind,
  windowState,
} from "./domain/occasion-pure";
export {
  countApproved,
  getOccasion,
  getOccasionByPublicId,
  getOccasionsByIds,
  listMemberAgenda,
  listOccasions,
  listOccasionsForTerm,
  type OccasionListRow,
  type OccasionRow,
  occasionInputSchema,
  searchOccasions,
} from "./domain/occasions";
export { getTodayPanal, listPanalGamesFor, startPanalAs, submitPanalWordAs } from "./domain/panal";
export { isPublicId } from "./domain/public-id-pure";
export {
  type Board,
  type CommitteeScore,
  type MyPosition,
  peopleBoards,
  type RankedPerson,
  rankCommittees,
} from "./domain/rankings";
export {
  getReconciliationRun,
  listReconciliationRuns,
  processReconciliationBatch,
  RECONCILE_BATCH,
  type ReconciliationReport,
  type ReconciliationRunRow,
  type ReportSampleEntry,
  reconciliationReport,
  resumeReconciliation,
  startReconciliation,
} from "./domain/reconciliation";
export { runReminders } from "./domain/reminders";
export {
  countPendingGamification,
  grantReward,
  listRewardsForPerson,
  type ReserveRewardInput,
  type RewardRow,
  releaseReward,
  rereserveReward,
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
  abandonSudokuAs,
  finishSudokuAs,
  getTodaySudoku,
  listSudokuRunsFor,
  startSudokuAs,
} from "./domain/sudoku";
export {
  answerSurveyAs,
  createSurveyInvites,
  getSurveyInviteForActor,
  surveySummary,
  surveySummaryForCommittee,
} from "./domain/surveys";
export { SURVEY_TEXT_MIN } from "./domain/surveys-pure";
export {
  getTodayWordle,
  listWordleGamesFor,
  startWordleAs,
  submitWordleGuessAs,
} from "./domain/wordle";
export { runWordleReminder, type WordleReminderResult } from "./domain/wordle-reminder";
export {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  GAME2048_REWARDS,
  GAME2048_RULES_VERSION,
  game2048Reward,
  isGame2048Moves,
  newGame2048,
  replayGame2048,
} from "./game2048-engine";
export type {
  FinishGame2048Input,
  Game2048Denial,
  Game2048Move,
  Game2048Result,
  Game2048RunView,
  Game2048StartedView,
  Game2048StartResult,
  Game2048State,
  Game2048Status,
  StartGame2048Input,
  TodayGame2048,
} from "./game2048-types";
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
  ChallengeSubmitReply,
  EvidenceFileStatus,
  MemberChallengeStatus,
  ParticipationStatus,
  PersonalPercent,
  RewardBreakdown,
  RewardCaps,
  RewardSource,
  RewardStatus,
  SubmitDenial,
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
  AbandonSudokuInput,
  FinishSudokuInput,
  StartSudokuInput,
  SudokuDenial,
  SudokuDifficulty,
  SudokuPlay,
  SudokuResult,
  SudokuRunView,
  SudokuStartedView,
  SudokuStartResult,
  SudokuStatus,
  TodaySudoku,
} from "./sudoku-types";
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
