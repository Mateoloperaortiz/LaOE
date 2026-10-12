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
  type BadgeRow,
  type CollectionFamily,
  collectionFor,
  listAchievementsForPerson,
  listBadgeCatalogAdmin,
  listFeaturedBadgesFor,
  listRevokedWithUsedBooster,
  unseenBadgesFor,
} from "./domain/badges";
export {
  type BoosterTarget,
  type BoosterView,
  campaignInputSchema,
  listActiveCampaignsForMember,
  listBoostersFor,
  listBoostersForTerm,
  listBoosterTargetsForMember,
  listCampaignsAdmin,
} from "./domain/boosters";
export {
  ChallengeAlreadySubmitted,
  EVIDENCE_TEXT_MAX,
  EVIDENCE_TEXT_MIN,
  listParticipationsForPerson,
  listPendingReviews,
  type SubmitResult,
} from "./domain/challenge-participation";
export {
  challengeInputSchema,
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
export { closingSummary, getTermStanding } from "./domain/closing";
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
  EVIDENCE_KEY_PATTERN,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MIN_BYTES,
  EVIDENCE_TYPES,
  listEvidenceFilesFor,
  prepareEvidenceUpload,
  resolveEvidenceRedirect,
} from "./domain/evidence";
export { listCheckInsForExport } from "./domain/exports";
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
  grantBoosterAs,
  markSeenAs,
  publishChallengeAs,
  resumeReconciliationAs,
  reviewParticipationAs,
  revokeBoosterAs,
  setBoosterTargetAs,
  setFeaturedAs,
  startReconciliationAs,
  submitEvidenceAs,
  submitTriviaAs,
  updateChallengeAs,
} from "./domain/gamification-commands";
export { gamificationOverview } from "./domain/gamification-metrics";
export { isVoluntaryOccasion } from "./domain/gamification-pure";
export {
  balanceFor,
  type LedgerListRow,
  listEntriesFor,
  listEntriesForPerson,
  listLedger,
} from "./domain/ledger";
export { levelFor, POINT_ENTRY_KINDS, type PointEntryKind } from "./domain/ledger-pure";
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
export { peopleBoards, rankCommittees } from "./domain/rankings";
export {
  getReconciliationRun,
  listReconciliationRuns,
  reconciliationReport,
} from "./domain/reconciliation";
export { runReminders } from "./domain/reminders";
export {
  grantReward,
  listRewardsForPerson,
  releaseReward,
  rereserveReward,
  reserveReward,
  reverseReward,
} from "./domain/rewards";
export { rotatingCodeAt, secondsUntilRotation } from "./domain/rotating-code-pure";
export { listCommitteeScores, listOccasionScores } from "./domain/scores";
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
export { runWordleReminder } from "./domain/wordle-reminder";
export type { Game2048Result, Game2048StartResult } from "./game2048-types";
export type {
  BoosterKind,
  BoosterState,
  ChallengeState,
  ChallengeSubmitReply,
  MemberChallengeStatus,
} from "./gamification-types";
export {
  BADGE_FAMILIES,
  BOOSTER_KINDS,
  BOOSTER_STATES,
  CHALLENGE_KINDS,
} from "./gamification-types";
export type { SudokuResult, SudokuStartResult } from "./sudoku-types";
