// Faltas y sanciones sin I/O (Regl. cap. 9 y Anexo 1; ADR-060 regla 6): duraciones, vigencia,
// suspensión de derechos y la advertencia de expulsión que el cierre convierte en propuesta.

export type SanctionKind = "WARNING" | "MINOR" | "MAJOR" | "SUSPENSION" | "OFFICE_BAN";

export const SANCTION_KINDS: readonly SanctionKind[] = [
  "WARNING",
  "MINOR",
  "MAJOR",
  "SUSPENSION",
  "OFFICE_BAN",
];

/** Días calendario de suspensión de derechos y beneficios (Regl. art. 69.1 y 69.2). */
export const SUSPENSION_DAYS: Partial<Record<SanctionKind, number>> = { WARNING: 7, MINOR: 20 };

/** Una suspensión explícita no supera un mes calendario (Regl. art. 58). */
export const MAX_SUSPENSION_MONTHS = 1;

/** Toda falta vence al año de asignada (Regl. art. 69 par. 3); la inhabilidad dura un año (art. 62 y 63). */
export const VALIDITY_YEARS = 1;

export interface SanctionLike {
  kind: SanctionKind;
  occurredOn: string;
  suspendedFrom: string | null;
  suspendedUntil: string | null;
  expiresOn: string;
  revokedAt: Date | null;
}

function fromKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const date = fromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dayKeyOf(date);
}

export function addMonths(key: string, months: number): string {
  const date = fromKey(key);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return dayKeyOf(date);
}

export function addYears(key: string, years: number): string {
  return addMonths(key, years * 12);
}

export interface DerivedDates {
  suspendedFrom: string | null;
  suspendedUntil: string | null;
  expiresOn: string;
}

/**
 * Fechas de una sanción a partir del tipo y la fecha de la falta: la suspensión de un llamado o una
 * leve empieza el mismo día; una suspensión explícita lleva su fin; la vigencia es de un año.
 */
export function deriveDates(
  kind: SanctionKind,
  occurredOn: string,
  suspendedUntil: string | null,
): DerivedDates | { error: "T-2241" } {
  const expiresOn = addYears(occurredOn, VALIDITY_YEARS);
  if (kind === "SUSPENSION") {
    if (
      !suspendedUntil ||
      suspendedUntil < occurredOn ||
      suspendedUntil > addMonths(occurredOn, MAX_SUSPENSION_MONTHS)
    ) {
      return { error: "T-2241" };
    }
    return { suspendedFrom: occurredOn, suspendedUntil, expiresOn };
  }
  const days = SUSPENSION_DAYS[kind];
  if (days === undefined) {
    return { suspendedFrom: null, suspendedUntil: null, expiresOn };
  }
  return { suspendedFrom: occurredOn, suspendedUntil: addDays(occurredOn, days), expiresOn };
}

/** Viva: no revocada y sin vencer al día dado. */
export function isLive(item: SanctionLike, onKey: string): boolean {
  return item.revokedAt === null && item.occurredOn <= onKey && item.expiresOn >= onKey;
}

/** Derechos y beneficios suspendidos ese día: hasta cuándo, o nulo. */
export function suspendedUntil(items: ReadonlyArray<SanctionLike>, onKey: string): string | null {
  const ends = items
    .filter(
      (item) =>
        isLive(item, onKey) &&
        item.suspendedFrom !== null &&
        item.suspendedUntil !== null &&
        item.suspendedFrom <= onKey &&
        onKey <= item.suspendedUntil,
    )
    .map((item) => item.suspendedUntil as string)
    .sort();
  return ends.at(-1) ?? null;
}

/** Inhabilitado para cargos directivos ese día (Regl. art. 62 y 63). */
export function hasOfficeBan(items: ReadonlyArray<SanctionLike>, onKey: string): boolean {
  return items.some((item) => item.kind === "OFFICE_BAN" && isLive(item, onKey));
}

/** Una falta grave viva más cualquier otra sanción viva: expulsión (Regl. art. 69.3). */
export function expulsionWarning(items: ReadonlyArray<SanctionLike>, onKey: string): boolean {
  const live = items.filter((item) => isLive(item, onKey));
  return live.some((item) => item.kind === "MAJOR") && live.length >= 2;
}

export type SanctionState = "LIVE" | "EXPIRED" | "REVOKED";

export function sanctionState(item: SanctionLike, onKey: string): SanctionState {
  if (item.revokedAt !== null) {
    return "REVOKED";
  }
  return item.expiresOn >= onKey ? "LIVE" : "EXPIRED";
}
