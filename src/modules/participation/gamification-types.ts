// Contrato serializable de la gamificación (ADR-067): sin `server-only`, lo pueden leer las páginas.

export type ChallengeKind = "PRESENTIAL" | "TRIVIA" | "EVIDENCE";
export type ChallengeAudience = "ALL" | "NEW" | "VETERAN" | "COMMITTEES";
/** Lo que persiste `challenge.status`; el resto se deriva de la ventana con `challengeState`. */
export type ChallengeStoredStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";
export type ChallengeState = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED";
export type ParticipationStatus = "PENDING" | "COMPLETED" | "REJECTED" | "ANNULLED";
/** Lo que ve el miembro; SENT es transitorio del cliente tras enviar. Orden de la lista T-2410. */
export type MemberChallengeStatus =
  | "AVAILABLE"
  | "SENT"
  | "PENDING"
  | "COMPLETED"
  | "REJECTED"
  | "EXPIRED";

/** Motivo de rechazo de una entrega del miembro (trivia o evidencia). */
export type SubmitDenial =
  | "DISABLED"
  | "NOT_FOUND"
  | "NOT_OPEN"
  | "NOT_ELIGIBLE"
  | "ALREADY"
  | "TERM_CLOSED"
  | "INVALID_INPUT"
  | "REQUEST_CONFLICT"
  | "INCOMPLETE";

/** Respuesta serializable de las acciones de entrega: nunca la fila cruda de la base. */
export type ChallengeSubmitReply =
  | {
      ok: true;
      status: MemberChallengeStatus;
      score?: number;
      total?: number;
      points?: number;
      reason?: string | null;
    }
  | { ok: false; reason: SubmitDenial };
export type BoosterKind = "PLUS_50" | "PLUS_100";
export type BoosterStoredStatus = "AVAILABLE" | "RESERVED" | "CONSUMED" | "REVOKED";
/** EXPIRED se deriva: un AVAILABLE con `expiresAt` pasado. Orden de la lista T-2455. */
export type BoosterState = BoosterStoredStatus | "EXPIRED";
export type RewardStatus = "RESERVED" | "GRANTED" | "RELEASED" | "REVERSED";
export type RewardSource = "CHALLENGE" | "CHECKIN";
export type CampaignPercent = 25 | 50 | 100;
export type PersonalPercent = 0 | 50 | 100;
/** Orden de la lista T-2473. */
export type BadgeFamily =
  | "EN_PARCHE"
  | "EXPLORADOR"
  | "RELAMPAGO"
  | "PALABRA_A_PALABRA"
  | "SPECIAL";

export interface RewardCaps {
  daily: number;
  weekly: number;
}

export interface RewardBreakdown {
  base: number;
  personalPercent: PersonalPercent;
  campaignPercent: 0 | CampaignPercent;
  extraRequested: number;
  baseGranted: number;
  extraGranted: number;
  /** El booster personal solo se consume si aporta puntos por encima de la campaña. */
  personalConsumed: boolean;
  capped: boolean;
}

export const CHALLENGE_KINDS = [
  "PRESENTIAL",
  "TRIVIA",
  "EVIDENCE",
] as const satisfies readonly ChallengeKind[];
export const BOOSTER_KINDS = ["PLUS_50", "PLUS_100"] as const satisfies readonly BoosterKind[];
export const BOOSTER_STATES = [
  "AVAILABLE",
  "RESERVED",
  "CONSUMED",
  "EXPIRED",
  "REVOKED",
] as const satisfies readonly BoosterState[];
export const BADGE_FAMILIES = [
  "EN_PARCHE",
  "EXPLORADOR",
  "RELAMPAGO",
  "PALABRA_A_PALABRA",
  "SPECIAL",
] as const satisfies readonly BadgeFamily[];
