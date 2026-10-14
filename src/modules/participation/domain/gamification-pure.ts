import {
  APP_TIME_ZONE,
  addDays,
  atHourIn,
  dateKeyIn,
  zonedInputToUtc,
} from "@/shared/lib/dates-pure";
import type {
  BoosterKind,
  BoosterState,
  BoosterStoredStatus,
  CampaignPercent,
  ChallengeAudience,
  ChallengeState,
  ChallengeStoredStatus,
  MemberChallengeStatus,
  ParticipationStatus,
  PersonalPercent,
  RewardBreakdown,
  RewardCaps,
} from "../gamification-types";
import type { OccasionCategory, OccasionKind } from "./occasion-pure";

// Reglas puras de la gamificación (ADR-067): sin I/O. Las claves de día y semana usan el día civil
// de Colombia; la zona llega por parámetro para que el archivo no lea configuración.

export const GAMIFICATION_TIMEZONE = APP_TIME_ZONE;

/**
 * Premio de una participación o de un check-in impulsado: `pct` se topa en +100 %, el extra se
 * redondea hacia abajo y el cupo disponible cubre primero la base. La campaña se atribuye antes
 * que el booster personal, que solo se consume si aporta puntos por encima de ella.
 */
export function computeReward(input: {
  base: number;
  personalPercent: PersonalPercent;
  campaignPercent: 0 | CampaignPercent;
  usedDaily: number;
  usedWeekly: number;
  caps: RewardCaps;
  /** CHECKIN: la base ya la acredita creditCheckIn fuera del cupo; solo el extra consume tope. */
  baseCountsTowardCap?: boolean;
}): RewardBreakdown {
  const baseCounts = input.baseCountsTowardCap !== false;
  const pct = Math.min(input.personalPercent + input.campaignPercent, 100);
  const extraRequested = Math.floor((input.base * pct) / 100);
  const remaining = Math.max(
    0,
    Math.min(input.caps.daily - input.usedDaily, input.caps.weekly - input.usedWeekly),
  );
  const baseGranted = baseCounts ? Math.min(input.base, remaining) : 0;
  const extraGranted = Math.min(extraRequested, remaining - baseGranted);
  const campaignOnly = Math.floor((input.base * input.campaignPercent) / 100);
  const personalConsumed = input.personalPercent > 0 && extraGranted > campaignOnly;
  const capped = baseCounts
    ? baseGranted < input.base || extraGranted < extraRequested
    : extraGranted < extraRequested;
  return {
    base: input.base,
    personalPercent: input.personalPercent,
    campaignPercent: input.campaignPercent,
    extraRequested,
    baseGranted,
    extraGranted,
    personalConsumed,
    capped,
  };
}

export function boosterPercent(kind: BoosterKind): 50 | 100 {
  return kind === "PLUS_100" ? 100 : 50;
}

/**
 * "AAAA-MM-DD" del día civil de `at` en la zona dada. Es el único cálculo del día de la gamificación:
 * la clave de los topes diarios y el `day` de las partidas de los cuatro juegos (ADR-119 regla 6).
 */
export function dayKeyFor(at: Date, timeZone = GAMIFICATION_TIMEZONE): string {
  return dateKeyIn(timeZone, at);
}

/**
 * Instante (ISO) en que empieza el día civil siguiente a `day` ("AAAA-MM-DD") en la zona dada: lo que
 * un juego anuncia como su próxima partida. Recibe el día y no el instante porque una partida vencida
 * anuncia el día que siguió al suyo, no el que sigue a hoy. La medianoche la resuelve la zona: acá no
 * hay horas fijas de desfase ni días de 24 horas sumados a mano.
 */
export function nextDayAt(day: string, timeZone = GAMIFICATION_TIMEZONE): string {
  return atHourIn(timeZone, addDays(day, 1), 0).toISOString();
}

/** Lunes de la semana local que contiene `at`, como "AAAA-MM-DD". */
export function weekKeyFor(at: Date, timeZone = GAMIFICATION_TIMEZONE): string {
  const day = dateKeyIn(timeZone, at);
  const back = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -back);
}

/** Estado visible del reto: `SCHEDULED` antes de abrir, `CLOSED` desde `closesAt`. */
export function challengeState(
  row: { status: ChallengeStoredStatus; opensAt: Date; closesAt: Date },
  now: Date,
): ChallengeState {
  if (row.status === "DRAFT") return "DRAFT";
  if (row.status === "CANCELLED") return "CANCELLED";
  if (row.opensAt > now) return "SCHEDULED";
  return row.closesAt > now ? "OPEN" : "CLOSED";
}

/**
 * Estado del reto para el miembro (lista T-2410). `SENT` nunca sale de aquí: es la confirmación
 * transitoria del cliente. Un reto programado se muestra disponible con su fecha de apertura.
 */
export function memberChallengeStatus(
  state: ChallengeState,
  participation: { status: ParticipationStatus } | null,
): MemberChallengeStatus {
  if (participation) {
    if (participation.status === "PENDING") return "PENDING";
    if (participation.status === "COMPLETED") return "COMPLETED";
    return "REJECTED";
  }
  return state === "OPEN" || state === "SCHEDULED" ? "AVAILABLE" : "EXPIRED";
}

/** Elegibilidad por público congelado: la membresía elegible es la misma regla del check-in. */
export function audienceIncludes(
  challenge: {
    termId: string;
    audience: ChallengeAudience;
    audienceCommitteeIds: string[];
  },
  member: {
    status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
    firstTermId: string;
    committeeIds: readonly string[];
  } | null,
): boolean {
  if (!member || (member.status !== "ACTIVE" && member.status !== "HONORARY")) {
    return false;
  }
  switch (challenge.audience) {
    case "ALL":
      return true;
    case "NEW":
      return member.firstTermId === challenge.termId;
    case "VETERAN":
      return member.firstTermId !== challenge.termId;
    case "COMMITTEES":
      return member.committeeIds.some((id) => challenge.audienceCommitteeIds.includes(id));
  }
}

/** Calificación en servidor: aprueba si aciertos × 100 ≥ passPercent × total, sin flotantes. */
export function gradeTrivia(
  answers: readonly number[],
  correct: readonly number[],
  passPercent: number,
): { score: number; total: number; passed: boolean } {
  const total = correct.length;
  let score = 0;
  for (let i = 0; i < total; i += 1) {
    if (answers[i] === correct[i]) score += 1;
  }
  return { score, total, passed: score * 100 >= passPercent * total };
}

/** Ocasión que cuenta para "En parche" y admite boosters (ADR-067: actividad voluntaria). */
export function isVoluntaryOccasion(row: {
  kind: OccasionKind;
  category: OccasionCategory;
}): boolean {
  return (
    (row.kind === "ACTIVITY" || row.kind === "EDITION_SESSION") &&
    row.category !== "COMMITTEE_MEETING" &&
    row.category !== "INDUCTION"
  );
}

/** Los boosters emitidos en un término vencen a las 23:59:59.999 de su `endsOn` en Colombia. */
export function boosterExpiresAt(term: { endsOn: string }, timeZone = GAMIFICATION_TIMEZONE): Date {
  return new Date(zonedInputToUtc(`${term.endsOn}T23:59`, timeZone).getTime() + 59_999);
}

/** `EXPIRED` es derivado: un AVAILABLE con `expiresAt` pasado; un RESERVED espera su revisión. */
export function boosterState(
  row: { status: BoosterStoredStatus; expiresAt: Date },
  now: Date,
): BoosterState {
  return row.status === "AVAILABLE" && row.expiresAt <= now ? "EXPIRED" : row.status;
}
