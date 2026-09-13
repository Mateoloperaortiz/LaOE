// Elegibilidad a miembro honorario (Regl. art. 23; ADR-060 regla 13), sin I/O: cuatro de cinco
// requisitos derivados del historial. La app informa; la junta decide y la asamblea resuelve apelaciones.

export const HONORARY_REQUIREMENTS = [
  "COMMITTEE_ROLE_COMPLETE",
  "MACROEVENT_ROLE_COMPLETE",
  "ACTIVE_SEMESTERS",
  "BOARD_COMPLETE",
  "WORK_COMMITTEE_YEAR",
] as const;

export type HonoraryRequirement = (typeof HONORARY_REQUIREMENTS)[number];

/** Cuatro de los cinco requisitos (Regl. art. 23). */
export const MIN_HONORARY_REQUIREMENTS = 4;
/** Seis semestres acumulados como miembro activo (art. 23.3). */
export const MIN_ACTIVE_SEMESTERS = 6;
/** Un año en un comité de trabajo: dos términos (art. 23.5). */
export const MIN_WORK_COMMITTEE_TERMS = 2;

export interface TermRef {
  id: string;
  code: string;
  endsOn: string;
}

export interface RoleSpan {
  termId: string;
  startedAt: Date;
  endedAt: Date | null;
}

export interface HonoraryFacts {
  terms: readonly TermRef[];
  /** Cargos de dirección de comité con su vigencia. */
  committeeRoles: readonly RoleSpan[];
  /** Direcciones de macroevento con la fecha de la edición. */
  macroeventRoles: ReadonlyArray<{ editionStartsAt: Date | null }>;
  /** Términos en los que la persona perteneció a algún comité. */
  memberTermIds: readonly string[];
  /** Términos con cargo de junta. */
  boardTermIds: readonly string[];
  /** Términos con pertenencia a un comité de trabajo (los lee `permanence`). */
  workCommitteeTermIds: readonly string[];
}

export interface HonoraryItem {
  code: HonoraryRequirement;
  met: boolean;
  /** Cuánto lleva: cargos completos, semestres, años de junta, términos de CT. */
  count: number;
}

export interface HonoraryEligibility {
  items: HonoraryItem[];
  metCount: number;
  eligible: boolean;
}

function endOfTerm(term: TermRef): Date {
  return new Date(`${term.endsOn}T23:59:59Z`);
}

/** Un cargo es completo si siguió vivo hasta el fin de un término ya cerrado (aproxima "la totalidad de su periodo"). */
function completeRoles(roles: readonly RoleSpan[], terms: readonly TermRef[], now: Date): number {
  const byId = new Map(terms.map((term) => [term.id, term]));
  return roles.filter((role) => {
    const term = byId.get(role.termId);
    if (!term) {
      return false;
    }
    const end = endOfTerm(term);
    return end < now && (role.endedAt === null || role.endedAt >= end);
  }).length;
}

/** Años con junta completa: los dos términos del mismo año, ambos cerrados (Est. art. 21 par. 1). */
export function completeBoardYears(
  boardTermIds: readonly string[],
  terms: readonly TermRef[],
  now: Date,
): number {
  const byId = new Map(terms.map((term) => [term.id, term]));
  const byYear = new Map<string, Set<number>>();
  for (const id of boardTermIds) {
    const term = byId.get(id);
    if (!term || endOfTerm(term) >= now) {
      continue;
    }
    const [year, semester] = term.code.split("-");
    if (!year || !semester) {
      continue;
    }
    const set = byYear.get(year) ?? new Set<number>();
    set.add(Number.parseInt(semester, 10));
    byYear.set(year, set);
  }
  return [...byYear.values()].filter((set) => set.has(1) && set.has(2)).length;
}

export function honoraryEligibility(facts: HonoraryFacts, now = new Date()): HonoraryEligibility {
  const byId = new Map(facts.terms.map((term) => [term.id, term]));
  const closedTerms = (ids: readonly string[]) =>
    new Set(
      ids.filter((id) => {
        const term = byId.get(id);
        return term !== undefined && endOfTerm(term) < now;
      }),
    ).size;
  const counts: Record<HonoraryRequirement, number> = {
    COMMITTEE_ROLE_COMPLETE: completeRoles(facts.committeeRoles, facts.terms, now),
    MACROEVENT_ROLE_COMPLETE: facts.macroeventRoles.filter(
      (role) => role.editionStartsAt !== null && role.editionStartsAt < now,
    ).length,
    ACTIVE_SEMESTERS: closedTerms(facts.memberTermIds),
    BOARD_COMPLETE: completeBoardYears(facts.boardTermIds, facts.terms, now),
    WORK_COMMITTEE_YEAR: closedTerms(facts.workCommitteeTermIds),
  };
  const thresholds: Record<HonoraryRequirement, number> = {
    COMMITTEE_ROLE_COMPLETE: 1,
    MACROEVENT_ROLE_COMPLETE: 1,
    ACTIVE_SEMESTERS: MIN_ACTIVE_SEMESTERS,
    BOARD_COMPLETE: 1,
    WORK_COMMITTEE_YEAR: MIN_WORK_COMMITTEE_TERMS,
  };
  const items = HONORARY_REQUIREMENTS.map((code) => ({
    code,
    count: counts[code],
    met: counts[code] >= thresholds[code],
  }));
  const metCount = items.filter((item) => item.met).length;
  return { items, metCount, eligible: metCount >= MIN_HONORARY_REQUIREMENTS };
}
