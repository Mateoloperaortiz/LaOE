// API pública del módulo competition (ADR-089 a ADR-091, ADR-095, ADR-098, ADR-101 y ADR-105): The
// Games, la competencia por equipos de Días EAFIT, sus apuestas, sus capitanes, sus poderes, el
// personal de cada base y el seguimiento del registro. Lo usan src/app y nadie más.
export {
  type CompetitionActor,
  type CompetitionRoles,
  competitionRoles,
  listMyCompetitionRoles,
  type MyCompetitionRole,
  THE_GAMES_ROLE_CODE,
} from "./domain/access";
export { MARKET_STATUSES, type MarketStatus } from "./domain/betting-pure";
export { formatTeamCode, normalizeTeamCode, TEAM_CODE_LENGTH } from "./domain/codes-pure";
export * from "./domain/commands";
export {
  type EnterHubResult,
  getHubState,
  getHubTeam,
  type HubTeam,
  hubAddress,
  hubCookieValue,
  hubSessionFromCookie,
} from "./domain/hub";
export {
  HUB_API_PATH,
  HUB_COOKIE,
  type HubSession,
  type HubState,
  hubStateSchema,
} from "./domain/hub-pure";
export { type JuryTeamResult, PODIUM_POINTS, podiumTie } from "./domain/jury-pure";
export type { PlaceBetResult } from "./domain/markets";
export type { RotationMatchupsResult } from "./domain/play";
export type { ImportPowersResult } from "./domain/powers";
export {
  LATE_START_SECONDS,
  POWER_EFFECTS,
  POWER_RULES,
  POWER_SLUGS,
  POWER_TYPES,
  type Power,
  type PowerDetail,
  type PowerEffect,
  type PowerSide,
} from "./domain/powers-pure";
export {
  type JudgeMatchupPowers,
  listPowerBoard,
  type PowerBoard,
  type PowerBoardGrant,
  type PowerBoardTeam,
  type PowerBoardUse,
} from "./domain/powers-reads";
export {
  type AnnouncementRow,
  type BaseRow,
  type CaptainRow,
  type CompetitionRow,
  creditBalances,
  type ExtraRubricTeam,
  type ExtraView,
  getCompetition,
  getCompetitionBySlug,
  getLiveRotations,
  getRotation,
  getScheduleForValidation,
  judgeView,
  listAnnouncements,
  listBases,
  listCaptains,
  listCompetitions,
  listExtras,
  listLedger,
  listMarkets,
  listPendingMatchups,
  listRegistrationCandidates,
  listRotations,
  listStaff,
  listStaffFor,
  listStandings,
  listSupport,
  listTeamBetReturns,
  listTeams,
  type MarketView,
  type MatchupView,
  type RegistrationCandidate,
  type RotationSummary,
  type RotationView,
  type StaffRow,
  type Standings,
  type SupportRow,
  TEAM_NAME_FIELD,
  type TeamRow,
} from "./domain/reads";
export { clearRouteMemo, getTeamRoute } from "./domain/route";
export { type RouteStop, type TeamRoute, teamRouteSchema } from "./domain/route-pure";
export { RUBRIC_MAX_SCORE, RUBRIC_MIN_SCORE, type RubricLevel } from "./domain/rubric-pure";
export type { ImportDayResult } from "./domain/schedule-import";
export {
  type Day,
  pairCountKey,
  pairCounts,
  SCHEDULE_ERROR_KINDS,
  SCHEDULE_ISSUE_KINDS,
  type ScheduleIssue,
  type ScheduleReport,
  validateSchedule,
} from "./domain/schedule-pure";
export { BASE_KINDS, type BaseKind, OUTCOMES, type Outcome, POINTS } from "./domain/scoring-pure";
export {
  COMPETITION_STATUSES,
  type CompetitionStatus,
  EXTRA_KINDS,
  type IssuedCode,
} from "./domain/setup";
export { clearShowcaseMemo, getShowcase } from "./domain/showcase";
export { SHOWCASE_VERSION, type Showcase, showcaseSchema } from "./domain/showcase-pure";
export { dayName, type ImportStaffResult, type StaffPreviewBase } from "./domain/staff-import";
export type { StandingRow } from "./domain/standings-pure";
export { getRecordingTracker, type RecordingTracker, type TrackerBase } from "./domain/tracking";
export type { BaseState, DelayRow, JudgeNudge, RecordedBy } from "./domain/tracking-pure";
