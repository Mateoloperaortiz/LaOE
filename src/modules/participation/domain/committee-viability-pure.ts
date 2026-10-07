// Viabilidad de un comité sin I/O (Regl. art. 25 y 26; ADR-060 regla 8): las causales de
// desactivación que la app puede ver y los criterios del periodo de prueba, como avisos en el orden
// de T-2264. La desactivación sigue siendo decisión de la junta.

export type ViabilityAlert =
  | "FEW_DIRECTIONS"
  | "MISSING_REQUIRED"
  | "FEW_MEMBERS"
  | "ABSENCES"
  | "NO_EVENT"
  | "TRIAL_FEW_MEMBERS"
  | "TRIAL_LOW_ATTENDANCE"
  | "TRIAL_ENDING";

export const VIABILITY_ALERTS: readonly ViabilityAlert[] = [
  "FEW_DIRECTIONS",
  "MISSING_REQUIRED",
  "FEW_MEMBERS",
  "ABSENCES",
  "NO_EVENT",
  "TRIAL_FEW_MEMBERS",
  "TRIAL_LOW_ATTENDANCE",
  "TRIAL_ENDING",
];

/** Regl. art. 26: tres direcciones, seis miembros fuera de la mesa, tres faltas; art. 25: diez miembros y 90 %. */
export const MIN_DIRECTIONS = 3;
export const MIN_MEMBERS = 6;
export const MAX_ABSENCES = 3;
export const TRIAL_MIN_MEMBERS = 10;
export const TRIAL_MIN_ATTENDANCE = 0.9;
export const TRIAL_ENDING_DAYS = 30;

export interface ViabilityInput {
  status: "ACTIVE" | "INACTIVE" | "ON_TRIAL";
  /** Cargos de dirección distintos con titular vivo. */
  directions: number;
  /** Cargos obligatorios sin titular. */
  missingRequired: number;
  /** Miembros activos del comité sin cargo de dirección. */
  membersOutsideDirection: number;
  unexcusedAbsences: number;
  representedAssemblies: number;
  closedAssemblies: number;
  eventsThisTerm: number;
  /** El término pasó su mitad: recién entonces se avisa que no hay evento propio. */
  pastMidterm: boolean;
  trialEndsOn: string | null;
  todayKey: string;
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (new Date(`${toKey}T00:00:00Z`).getTime() - new Date(`${fromKey}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

/**
 * Día de la mitad del término (AAAA-MM-DD): aritmética de calendario sobre sus fechas clave, sin
 * zona, igual que la mitad de los avisos de permanencia. Se compara con el día civil de Colombia.
 */
export function termMidpointKey(startsOn: string, endsOn: string): string {
  const midpoint = new Date(`${startsOn}T00:00:00Z`);
  midpoint.setUTCDate(midpoint.getUTCDate() + Math.floor(daysBetween(startsOn, endsOn) / 2));
  return midpoint.toISOString().slice(0, 10);
}

export function viabilityAlerts(input: ViabilityInput): ViabilityAlert[] {
  if (input.status === "INACTIVE") {
    return [];
  }
  const alerts: ViabilityAlert[] = [];
  if (input.directions < MIN_DIRECTIONS) alerts.push("FEW_DIRECTIONS");
  if (input.missingRequired > 0) alerts.push("MISSING_REQUIRED");
  if (input.membersOutsideDirection < MIN_MEMBERS) alerts.push("FEW_MEMBERS");
  if (input.unexcusedAbsences >= MAX_ABSENCES) alerts.push("ABSENCES");
  if (input.eventsThisTerm === 0 && input.pastMidterm) alerts.push("NO_EVENT");
  if (input.status === "ON_TRIAL") {
    if (input.membersOutsideDirection < TRIAL_MIN_MEMBERS) alerts.push("TRIAL_FEW_MEMBERS");
    if (
      input.closedAssemblies > 0 &&
      input.representedAssemblies / input.closedAssemblies < TRIAL_MIN_ATTENDANCE
    ) {
      alerts.push("TRIAL_LOW_ATTENDANCE");
    }
    if (input.trialEndsOn !== null) {
      const days = daysBetween(input.todayKey, input.trialEndsOn);
      if (days <= TRIAL_ENDING_DAYS) alerts.push("TRIAL_ENDING");
    }
  }
  return alerts;
}
