import { type Actor, runCommand } from "@/db/tx";
import { findMembersByEmails, listActiveMemberRefs } from "@/modules/people";
import type { CompetitionActor } from "./access";
import {
  clearCaptains,
  type ImportCaptainsInput,
  type ImportCaptainsResult,
  importCaptains,
  setCaptainsVisibility,
} from "./captains";
import { type EnterHubResult, enterHub } from "./hub";
import type { HubSession } from "./hub-pure";
import {
  type BetInput,
  cancelMarket,
  createMarket,
  grantStartingCredits,
  type HubBetInput,
  type MarketInput,
  type PlaceBetResult,
  placeBet,
  placeHubBet,
  resolveMarket,
  setMarketOpen,
} from "./markets";
import {
  adjustRotationTimer,
  advanceRotation,
  closeRotation,
  deleteDaySchedule,
  type GenerateDayInput,
  generateDaySchedule,
  type ResultInput,
  type RotationMatchupsInput,
  type RotationMatchupsResult,
  recordResult,
  saveRotationMatchups,
  startMatchup,
  startRotation,
  voidResult,
} from "./play";
import {
  type AddPowerInput,
  addPowerGrant,
  type DeclarePowerInput,
  type DeliverPowersInput,
  declarePower,
  deliverPowerGrants,
  type ImportPowersInput,
  type ImportPowersResult,
  importPowerGrants,
  type RevertPowerInput,
  revertPowerUse,
  type VoidPowerInput,
  voidPowerGrant,
} from "./powers";
import { type ImportDayInput, type ImportDayResult, importDaySchedule } from "./schedule-import";
import {
  type AdjustmentInput,
  type AnnouncementInput,
  addAdjustment,
  assignStaff,
  type BaseInput,
  type CompetitionInput,
  type CompetitionSettingsInput,
  type CompetitionStatus,
  createAnnouncement,
  createCompetition,
  createExtra,
  createTeam,
  type ExtraInput,
  type ExtraPointsInput,
  type IssuedCode,
  issueTeamCodes,
  type RubricScoresInput,
  removeStaff,
  removeSupport,
  type StaffInput,
  saveBase,
  setAnnouncementActive,
  setCompetitionStatus,
  setExtraPoints,
  setRubricScores,
  setTeamStatus,
  type TeamInput,
  type TeamUpdateInput,
  updateCompetitionSettings,
  updateTeam,
} from "./setup";
import {
  type ImportStaffInput,
  type ImportStaffResult,
  importStaffSheet,
  staffSheetEmails,
} from "./staff-import";
import type { StaffDirectory } from "./staff-import-pure";

// Comandos de The Games (ADR-089, ADR-091): cada uno corre en runCommand con auditoría e IP. Quién
// puede llamarlos lo decide src/app, y el dominio lo relee dentro de la transacción (ADR-072).

type A = CompetitionActor;

export const createCompetitionAs = (actor: A, input: CompetitionInput) =>
  runCommand(actor, (ctx) => createCompetition(ctx, actor, input));
export const updateCompetitionSettingsAs = (
  actor: A,
  id: string,
  input: CompetitionSettingsInput,
) => runCommand(actor, (ctx) => updateCompetitionSettings(ctx, actor, id, input));
export const setCompetitionStatusAs = (actor: A, id: string, status: CompetitionStatus) =>
  runCommand(actor, (ctx) => setCompetitionStatus(ctx, actor, id, status));

export const createTeamAs = (actor: A, id: string, input: TeamInput) =>
  runCommand(actor, (ctx) => createTeam(ctx, actor, id, input));
export const updateTeamAs = (actor: A, id: string, teamId: string, input: TeamUpdateInput) =>
  runCommand(actor, (ctx) => updateTeam(ctx, actor, id, teamId, input));
export const setTeamStatusAs = (
  actor: A,
  id: string,
  teamId: string,
  status: "ACTIVE" | "WITHDRAWN",
) => runCommand(actor, (ctx) => setTeamStatus(ctx, actor, id, teamId, status));
export const issueTeamCodesAs = (
  actor: A,
  id: string,
  onlyMissing: boolean,
): Promise<IssuedCode[]> => runCommand(actor, (ctx) => issueTeamCodes(ctx, actor, id, onlyMissing));

export const importCaptainsAs = (
  actor: A,
  id: string,
  input: ImportCaptainsInput,
): Promise<ImportCaptainsResult> =>
  runCommand(actor, (ctx) => importCaptains(ctx, actor, id, input));
export const setCaptainsVisibilityAs = (actor: A, id: string, visible: boolean) =>
  runCommand(actor, (ctx) => setCaptainsVisibility(ctx, actor, id, visible));
export const clearCaptainsAs = (actor: A, id: string) =>
  runCommand(actor, (ctx) => clearCaptains(ctx, actor, id));

export const saveBaseAs = (actor: A, id: string, baseId: string | null, input: BaseInput) =>
  runCommand(actor, (ctx) => saveBase(ctx, actor, id, baseId, input));
export const assignStaffAs = (actor: A, id: string, input: StaffInput) =>
  runCommand(actor, (ctx) => assignStaff(ctx, actor, id, input));
export const removeStaffAs = (actor: A, id: string, staffId: string) =>
  runCommand(actor, (ctx) => removeStaff(ctx, actor, id, staffId));
export const removeSupportAs = (actor: A, id: string, supportId: string) =>
  runCommand(actor, (ctx) => removeSupport(ctx, actor, id, supportId));

/** Revisa o guarda el personal de una jornada desde la hoja del GAP (ADR-101). Los miembros que
 *  pueden quedar se leen antes de la transacción; dentro, el dominio relee la membresía de quien entra. */
export async function importStaffSheetAs(
  actor: A,
  id: string,
  input: ImportStaffInput,
): Promise<ImportStaffResult> {
  const [members, byEmail] = await Promise.all([
    listActiveMemberRefs(true),
    findMembersByEmails(staffSheetEmails(typeof input.text === "string" ? input.text : "")),
  ]);
  const directory: StaffDirectory = {
    members: members
      .filter((member) => !member.anonymized)
      .map((member) => ({ id: member.personId, fullName: member.fullName })),
    byEmail,
  };
  return runCommand(actor, (ctx) => importStaffSheet(ctx, actor, id, input, directory));
}

export const createAnnouncementAs = (actor: A, id: string, input: AnnouncementInput) =>
  runCommand(actor, (ctx) => createAnnouncement(ctx, actor, id, input));
export const setAnnouncementActiveAs = (
  actor: A,
  id: string,
  announcementId: string,
  active: boolean,
) => runCommand(actor, (ctx) => setAnnouncementActive(ctx, actor, id, announcementId, active));

export const createExtraAs = (actor: A, id: string, input: ExtraInput) =>
  runCommand(actor, (ctx) => createExtra(ctx, actor, id, input));
export const setExtraPointsAs = (actor: A, id: string, input: ExtraPointsInput) =>
  runCommand(actor, (ctx) => setExtraPoints(ctx, actor, id, input));
export const setRubricScoresAs = (actor: A, id: string, input: RubricScoresInput) =>
  runCommand(actor, (ctx) => setRubricScores(ctx, actor, id, input));
export const addAdjustmentAs = (actor: A, id: string, input: AdjustmentInput) =>
  runCommand(actor, (ctx) => addAdjustment(ctx, actor, id, input));

export const generateDayScheduleAs = (actor: A, id: string, input: GenerateDayInput) =>
  runCommand(actor, (ctx) => generateDaySchedule(ctx, actor, id, input));
export const importDayScheduleAs = (
  actor: A,
  id: string,
  input: ImportDayInput,
): Promise<ImportDayResult> => runCommand(actor, (ctx) => importDaySchedule(ctx, actor, id, input));
export const deleteDayScheduleAs = (actor: A, id: string, day: number) =>
  runCommand(actor, (ctx) => deleteDaySchedule(ctx, actor, id, day));
export const saveRotationMatchupsAs = (
  actor: A,
  id: string,
  rotationId: string,
  input: RotationMatchupsInput,
): Promise<RotationMatchupsResult> =>
  runCommand(actor, (ctx) => saveRotationMatchups(ctx, actor, id, rotationId, input));
export const startRotationAs = (actor: A, id: string, rotationId: string) =>
  runCommand(actor, (ctx) => startRotation(ctx, actor, id, rotationId));
export const adjustRotationTimerAs = (actor: A, id: string, rotationId: string, delta: number) =>
  runCommand(actor, (ctx) => adjustRotationTimer(ctx, actor, id, rotationId, delta));
export const closeRotationAs = (actor: A, id: string, rotationId: string) =>
  runCommand(actor, (ctx) => closeRotation(ctx, actor, id, rotationId));
export const advanceRotationAs = (actor: A, id: string) =>
  runCommand(actor, (ctx) => advanceRotation(ctx, actor, id));

export const recordResultAs = (actor: A, id: string, input: ResultInput) =>
  runCommand(actor, (ctx) => recordResult(ctx, actor, id, input));
export const startMatchupAs = (actor: A, id: string, matchupId: string) =>
  runCommand(actor, (ctx) => startMatchup(ctx, actor, id, matchupId));
export const voidResultAs = (actor: A, id: string, matchupId: string) =>
  runCommand(actor, (ctx) => voidResult(ctx, actor, id, matchupId));

export const grantStartingCreditsAs = (actor: A, id: string) =>
  runCommand(actor, (ctx) => grantStartingCredits(ctx, actor, id));
export const createMarketAs = (actor: A, id: string, input: MarketInput) =>
  runCommand(actor, (ctx) => createMarket(ctx, actor, id, input));
export const setMarketOpenAs = (actor: A, id: string, marketId: string, open: boolean) =>
  runCommand(actor, (ctx) => setMarketOpen(ctx, actor, id, marketId, open));
export const placeBetAs = (actor: A, id: string, input: BetInput): Promise<PlaceBetResult> =>
  runCommand(actor, (ctx) => placeBet(ctx, actor, id, input));
export const resolveMarketAs = (actor: A, id: string, marketId: string, winnerTeamId: string) =>
  runCommand(actor, (ctx) => resolveMarket(ctx, actor, id, marketId, winnerTeamId));
export const cancelMarketAs = (actor: A, id: string, marketId: string) =>
  runCommand(actor, (ctx) => cancelMarket(ctx, actor, id, marketId));

// Hub de capitanes (ADR-096): el actor no es una persona, solo lleva la IP para la auditoría.
export const enterHubAs = (
  actor: Actor,
  code: string,
  accept: number | null = null,
): Promise<EnterHubResult> => runCommand(actor, (ctx) => enterHub(ctx, code, accept));
export const placeHubBetAs = (actor: Actor, session: HubSession, input: HubBetInput) =>
  runCommand(actor, (ctx) => placeHubBet(ctx, session, input));

// Poderes (ADR-098).
export const importPowerGrantsAs = (
  actor: A,
  id: string,
  input: ImportPowersInput,
): Promise<ImportPowersResult> =>
  runCommand(actor, (ctx) => importPowerGrants(ctx, actor, id, input));
export const addPowerGrantAs = (actor: A, id: string, input: AddPowerInput) =>
  runCommand(actor, (ctx) => addPowerGrant(ctx, actor, id, input));
export const deliverPowerGrantsAs = (actor: A, id: string, input: DeliverPowersInput) =>
  runCommand(actor, (ctx) => deliverPowerGrants(ctx, actor, id, input));
export const voidPowerGrantAs = (actor: A, id: string, input: VoidPowerInput) =>
  runCommand(actor, (ctx) => voidPowerGrant(ctx, actor, id, input));
export const declarePowerAs = (actor: A, id: string, input: DeclarePowerInput) =>
  runCommand(actor, (ctx) => declarePower(ctx, actor, id, input));
export const revertPowerUseAs = (actor: A, id: string, input: RevertPowerInput) =>
  runCommand(actor, (ctx) => revertPowerUse(ctx, actor, id, input));
