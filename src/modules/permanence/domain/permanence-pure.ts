import type { AppliesTo, Computation, OccasionFilter, Rule, WorkGroupKind } from "./params";

// Cálculo de permanencia sin I/O (ADR-025 a ADR-028, ADR-036 regla 4): recibe reglas y hechos y
// devuelve, por persona, el desglose general, un resultado por comité y las asambleas obligatorias.
// Todo lo que se muestra o se decide sale de aquí; el snapshot solo persiste el resultado.

export type Condition = "ACTIVE" | "NEW" | "PROBATION" | "TRANSFER";
export type OpenState = "EN_CAMINO" | "EN_RIESGO" | "NO_ALCANZA";
export type FinalState = "CUMPLE" | "PRUEBA" | "NO_CUMPLE";
export type PermanenceState = OpenState | FinalState;
export type MembershipStatus = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
export type Evaluation = "PENDING" | "GOOD" | "INSUFFICIENT";
export type AssemblyKindName = "ORDINARY" | "BOARD_ELECTION" | "RUNOFF";
export type DecisionKind = "CONTINUES" | "PROBATION" | "EXIT_COMMITTEE" | "EXIT_OE";

export interface PermanenceConfig {
  thresholds: { active: number; new: number; probation: number; transfer: number };
  probationMargin: number;
  evaluationWindowDays: number;
  warningDays: number;
}

export interface TermLike {
  id: string;
  code: string;
  semester: number;
  startsOn: string;
  endsOn: string;
  requiredOrdinaryAssemblies: number;
  pointsClosedAt: Date | null;
  permanenceClosedAt: Date | null;
}

export interface OccasionFact {
  id: string;
  title: string;
  kind: "ACTIVITY" | "ASSEMBLY" | "EDITION_SESSION";
  assemblyKind: AssemblyKindName | null;
  category: string;
  committeeId: string | null;
  newMembersOnly: boolean;
  startsAt: Date;
  status: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
}

export interface GroupFact {
  id: string;
  kind: WorkGroupKind;
  code: string | null;
  name: string;
  evaluatorIds: string[];
}

export interface TermFacts {
  term: TermLike;
  config: PermanenceConfig;
  rules: Rule[];
  occasions: OccasionFact[];
  groups: GroupFact[];
}

export interface CommitteeFact {
  committeeId: string;
  roleCode: string;
  transferredIn: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
}

export interface GroupMembershipFact {
  groupId: string;
  evaluation: Evaluation;
  leftAt: Date | null;
  evaluatedById: string | null;
  evaluatedAt: Date | null;
  note: string | null;
}

export interface AssemblyRequirementFact {
  requiredOrdinary: number;
  requiresBoardElection: boolean;
  requiresRunoff: boolean;
}

export interface PersonFacts {
  personId: string;
  status: MembershipStatus;
  isNew: boolean;
  probation: boolean;
  committees: CommitteeFact[];
  /** Ids de las ocasiones con check-in aprobado. */
  attended: ReadonlySet<string>;
  groupMemberships: GroupMembershipFact[];
  leaderScores: Array<{ ruleId: string; value: number; note: string | null; scoredAt: Date }>;
  credits: Array<{ ruleId: string; value: number; reason: string }>;
  assemblyRequirement: AssemblyRequirementFact;
}

export interface UpcomingOccasion {
  occasionId: string;
  title: string;
  startsAt: string;
}

export type CriterionDetail =
  | {
      type: "CHECKIN_COUNT";
      attended: number;
      perUnit: number;
      occurred: number;
      upcoming: UpcomingOccasion[];
      opportunities: number | null;
    }
  | {
      type: "CHECKIN_THRESHOLD";
      attended: number;
      minCount: number;
      occurred: number;
      upcoming: UpcomingOccasion[];
      opportunities: number | null;
    }
  | { type: "CHECKIN_RATE"; attended: number; held: number; future: number; rate: number }
  | {
      type: "GROUP_EVALUATED";
      groups: Array<{
        groupId: string;
        name: string;
        evaluation: Evaluation;
        evaluatorIds: string[];
      }>;
      goodCount: number;
      pendingCount: number;
      tier: number | null;
    }
  | {
      type: "COMPOSITE";
      attended: number;
      minCount: number;
      upcoming: UpcomingOccasion[];
      group: {
        groupId: string;
        name: string;
        evaluation: Evaluation;
        evaluatorIds: string[];
      } | null;
    }
  | {
      type: "LEADER_SCORE";
      value: number | null;
      note: string | null;
      scoredAt: string | null;
      mandatory: boolean;
    }
  | { type: "MANUAL"; credited: number | null; reason: string | null };

export interface CriterionResult {
  ruleId: string;
  key: string;
  label: string;
  computation: Computation;
  weight: number;
  achieved: number;
  remaining: number;
  detail: CriterionDetail;
}

export interface CommitteeResult {
  committeeId: string;
  transferredIn: boolean;
  condition: Condition;
  threshold: number;
  committeeTotal: number;
  committeeMax: number;
  total: number;
  remaining: number;
  margin: number;
  state: PermanenceState;
  finalState: FinalState;
  criteria: CriterionResult[];
}

export interface MandatoryView {
  required: { ordinary: number; boardElection: boolean; runoff: boolean };
  attended: { ordinary: number; boardElection: boolean; runoff: boolean };
  met: boolean;
  missing: AssemblyKindName[];
  /** Obligatorias que ya pasaron sin registro y no tienen reemplazo programado. */
  lost: AssemblyKindName[];
  upcoming: Array<UpcomingOccasion & { assemblyKind: AssemblyKindName }>;
}

export interface PersonPermanence {
  personId: string;
  status: MembershipStatus;
  isNew: boolean;
  probation: boolean;
  /** Solo se evalúa a activos con al menos un comité vivo. */
  evaluated: boolean;
  general: CriterionResult[];
  generalTotal: number;
  generalMax: number;
  results: CommitteeResult[];
  mandatory: MandatoryView;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fecha en clave YYYY-MM-DD a partir de un instante, en UTC (las fechas del término ya son de calendario). */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dayKeyValue: string, days: number): string {
  const base = new Date(`${dayKeyValue}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return dayKey(base);
}

/** Condición de la persona en un comité (ADR-027): nuevo, en prueba, transferencia o activo. */
export function conditionFor(person: {
  isNew: boolean;
  probation: boolean;
  transferredIn: boolean;
}): Condition {
  if (person.isNew) {
    return "NEW";
  }
  if (person.probation) {
    return "PROBATION";
  }
  if (person.transferredIn) {
    return "TRANSFER";
  }
  return "ACTIVE";
}

/** Umbral del comité: el máximo de los que aplican (prueba con transferencia usa el de prueba). */
export function thresholdFor(
  person: { isNew: boolean; probation: boolean; transferredIn: boolean },
  thresholds: PermanenceConfig["thresholds"],
): number {
  const candidates = [thresholds.active];
  if (person.isNew) {
    candidates.push(thresholds.new);
  }
  if (person.probation) {
    candidates.push(thresholds.probation);
  }
  if (person.transferredIn) {
    candidates.push(thresholds.transfer);
  }
  return Math.max(...candidates);
}

export function ruleApplies(appliesTo: AppliesTo, isNew: boolean): boolean {
  return appliesTo === "ALL" || (appliesTo === "NEW") === isNew;
}

/** Valor del tramo alcanzado con `count` grupos buenos (tramos ordenados por cantidad). */
export function tierFor(
  tiers: ReadonlyArray<{ count: number; value: number }>,
  count: number,
): number {
  let value = 0;
  for (const tier of [...tiers].sort((a, b) => a.count - b.count)) {
    if (count >= tier.count) {
      value = tier.value;
    }
  }
  return value;
}

export function evaluationWindow(
  term: Pick<TermLike, "endsOn" | "permanenceClosedAt">,
  config: Pick<PermanenceConfig, "evaluationWindowDays">,
  now: Date,
): { opensOn: string; open: boolean } {
  const opensOn = addDays(term.endsOn, -config.evaluationWindowDays);
  return { opensOn, open: term.permanenceClosedAt === null && dayKey(now) >= opensOn };
}

function occasionMatches(
  occasion: OccasionFact,
  filter: OccasionFilter,
  ruleCommitteeId: string | null,
): boolean {
  if (occasion.status === "CANCELLED") {
    return false;
  }
  if (filter.occasionIds && filter.occasionIds.length > 0) {
    return filter.occasionIds.includes(occasion.id);
  }
  if (filter.category && occasion.category !== filter.category) {
    return false;
  }
  if (filter.kind && occasion.kind !== filter.kind) {
    return false;
  }
  if (filter.committee === "OWN" && occasion.committeeId !== ruleCommitteeId) {
    return false;
  }
  if (filter.newMembersOnly === "ONLY" && !occasion.newMembersOnly) {
    return false;
  }
  if (filter.newMembersOnly === "EXCLUDE" && occasion.newMembersOnly) {
    return false;
  }
  return true;
}

function upcomingOf(occasions: OccasionFact[], now: Date): OccasionFact[] {
  return occasions
    .filter((item) => item.startsAt > now && item.status !== "CLOSED")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function toUpcoming(occasions: OccasionFact[]): UpcomingOccasion[] {
  return occasions.slice(0, 3).map((item) => ({
    occasionId: item.id,
    title: item.title,
    startsAt: item.startsAt.toISOString(),
  }));
}

interface CheckInCounts {
  attended: number;
  occurred: number;
  upcoming: OccasionFact[];
  /** null cuando no hay información (nada ocurrió, nada programado, sin esperadas). */
  opportunities: number | null;
}

function countCheckIns(
  facts: TermFacts,
  person: PersonFacts,
  filter: OccasionFilter,
  ruleCommitteeId: string | null,
  now: Date,
): CheckInCounts {
  const matching = facts.occasions.filter((item) => occasionMatches(item, filter, ruleCommitteeId));
  const attended = matching.filter((item) => person.attended.has(item.id)).length;
  const occurred = matching.filter((item) => item.startsAt <= now).length;
  const upcoming = upcomingOf(matching, now);
  const expected = filter.expectedCount;
  let opportunities: number | null;
  if (expected === undefined) {
    opportunities = occurred === 0 && upcoming.length === 0 ? null : upcoming.length;
  } else {
    opportunities = Math.max(upcoming.length, expected - occurred);
  }
  return { attended, occurred, upcoming, opportunities };
}

function groupsOf(
  facts: TermFacts,
  groupKind: WorkGroupKind,
  code: string | undefined,
): GroupFact[] {
  return facts.groups.filter((item) => item.kind === groupKind && (!code || item.code === code));
}

interface GroupStanding {
  groups: Array<{ groupId: string; name: string; evaluation: Evaluation; evaluatorIds: string[] }>;
  goodCount: number;
  pendingCount: number;
}

function groupStanding(
  facts: TermFacts,
  person: PersonFacts,
  groupKind: WorkGroupKind,
  code?: string,
) {
  const candidates = groupsOf(facts, groupKind, code);
  const byId = new Map(candidates.map((item) => [item.id, item]));
  const groups: GroupStanding["groups"] = [];
  for (const membership of person.groupMemberships) {
    const group = byId.get(membership.groupId);
    if (!group) {
      continue;
    }
    if (membership.leftAt && membership.evaluation === "PENDING") {
      continue;
    }
    groups.push({
      groupId: group.id,
      name: group.name,
      evaluation: membership.evaluation,
      evaluatorIds: group.evaluatorIds,
    });
  }
  return {
    groups,
    goodCount: groups.filter((item) => item.evaluation === "GOOD").length,
    pendingCount: groups.filter((item) => item.evaluation === "PENDING").length,
  } satisfies GroupStanding;
}

interface ComputeOptions {
  now: Date;
  /** Con el término cerrado no queda nada posible y los estados son finales. */
  closed: boolean;
  windowOpen: boolean;
}

function groupAchieved(
  params: Extract<Rule, { computation: "GROUP_EVALUATED" }>["params"],
  weight: number,
  goodCount: number,
): { achieved: number; tier: number | null } {
  if (params.mode === "PER_GROUP") {
    return { achieved: Math.min(weight, (params.perGroup ?? 0) * goodCount), tier: null };
  }
  if (params.mode === "TIERS") {
    const tier = tierFor(params.tiers ?? [], goodCount);
    return { achieved: Math.min(weight, tier), tier };
  }
  return { achieved: goodCount >= 1 ? weight : 0, tier: null };
}

export function computeCriterion(
  rule: Rule,
  facts: TermFacts,
  person: PersonFacts,
  options: ComputeOptions,
): CriterionResult {
  const { now, closed, windowOpen } = options;
  const weight = rule.weight;
  const base = {
    ruleId: rule.id,
    key: rule.key,
    label: rule.label,
    computation: rule.computation,
    weight,
  };
  const cap = (value: number) => clamp(round2(value), 0, weight);
  const leftover = (achieved: number) => (closed ? 0 : round2(weight - achieved));

  switch (rule.computation) {
    case "CHECKIN_COUNT": {
      const counts = countCheckIns(facts, person, rule.params, rule.committeeId, now);
      const achieved = cap(rule.params.perUnit * counts.attended);
      const remaining = closed
        ? 0
        : counts.opportunities === null
          ? round2(weight - achieved)
          : cap(Math.min(weight - achieved, rule.params.perUnit * counts.opportunities));
      return {
        ...base,
        achieved,
        remaining,
        detail: {
          type: "CHECKIN_COUNT",
          attended: counts.attended,
          perUnit: rule.params.perUnit,
          occurred: counts.occurred,
          upcoming: toUpcoming(counts.upcoming),
          opportunities: counts.opportunities,
        },
      };
    }
    case "CHECKIN_THRESHOLD": {
      const counts = countCheckIns(facts, person, rule.params, rule.committeeId, now);
      const reached = counts.attended >= rule.params.minCount;
      const achieved = reached ? weight : 0;
      const stillPossible =
        counts.opportunities === null ||
        counts.attended + counts.opportunities >= rule.params.minCount;
      const remaining = closed || reached ? 0 : stillPossible ? weight : 0;
      return {
        ...base,
        achieved,
        remaining,
        detail: {
          type: "CHECKIN_THRESHOLD",
          attended: counts.attended,
          minCount: rule.params.minCount,
          occurred: counts.occurred,
          upcoming: toUpcoming(counts.upcoming),
          opportunities: counts.opportunities,
        },
      };
    }
    case "CHECKIN_RATE": {
      const membership = person.committees.find((item) => item.committeeId === rule.committeeId);
      const meetings = facts.occasions.filter(
        (item) =>
          item.status !== "CANCELLED" &&
          item.category === rule.params.category &&
          item.committeeId === rule.committeeId,
      );
      const eligible = meetings.filter((item) => {
        if (!membership) {
          return false;
        }
        if (membership.joinedAt && membership.joinedAt > item.startsAt) {
          return false;
        }
        if (membership.leftAt && membership.leftAt <= item.startsAt) {
          return false;
        }
        return true;
      });
      const held = eligible.filter((item) => item.startsAt <= now);
      const attended = held.filter((item) => person.attended.has(item.id)).length;
      const future = upcomingOf(eligible, now).length;
      const rate = held.length === 0 ? 0 : attended / held.length;
      const achieved = cap(weight * rate);
      let remaining = 0;
      if (!closed) {
        if (held.length + future === 0) {
          remaining = weight;
        } else {
          const projected = (attended + future) / (held.length + future);
          remaining = cap(weight * projected - achieved);
        }
      }
      return {
        ...base,
        achieved,
        remaining,
        detail: { type: "CHECKIN_RATE", attended, held: held.length, future, rate: round2(rate) },
      };
    }
    case "GROUP_EVALUATED": {
      const standing = groupStanding(facts, person, rule.params.groupKind, rule.params.code);
      const { achieved: raw, tier } = groupAchieved(rule.params, weight, standing.goodCount);
      const achieved = cap(raw);
      let remaining = 0;
      if (!closed) {
        if (!windowOpen) {
          remaining = round2(weight - achieved);
        } else {
          const potential = groupAchieved(
            rule.params,
            weight,
            standing.goodCount + standing.pendingCount,
          ).achieved;
          remaining = cap(potential - achieved);
        }
      }
      return {
        ...base,
        achieved,
        remaining,
        detail: {
          type: "GROUP_EVALUATED",
          groups: standing.groups,
          goodCount: standing.goodCount,
          pendingCount: standing.pendingCount,
          tier,
        },
      };
    }
    case "COMPOSITE": {
      const counts = countCheckIns(facts, person, rule.params.checkIns, rule.committeeId, now);
      const standing = groupStanding(
        facts,
        person,
        rule.params.group.groupKind,
        rule.params.group.code,
      );
      const group =
        standing.groups.find((item) => item.evaluation === "GOOD") ??
        standing.groups.find((item) => item.evaluation === "PENDING") ??
        standing.groups[0] ??
        null;
      const reached = counts.attended >= rule.params.checkIns.minCount;
      const good = standing.goodCount >= 1;
      const achieved = reached && good ? weight : 0;
      const checkInsPossible =
        reached ||
        counts.opportunities === null ||
        counts.attended + counts.opportunities >= rule.params.checkIns.minCount;
      const groupPossible = good || !windowOpen || standing.pendingCount > 0;
      const remaining = closed || achieved > 0 ? 0 : checkInsPossible && groupPossible ? weight : 0;
      return {
        ...base,
        achieved,
        remaining,
        detail: {
          type: "COMPOSITE",
          attended: counts.attended,
          minCount: rule.params.checkIns.minCount,
          upcoming: toUpcoming(counts.upcoming),
          group,
        },
      };
    }
    case "LEADER_SCORE": {
      const score = person.leaderScores.find((item) => item.ruleId === rule.id) ?? null;
      const value = score ? score.value : rule.params.mandatory ? weight : 0;
      const achieved = cap(value);
      return {
        ...base,
        achieved,
        remaining: leftover(achieved),
        detail: {
          type: "LEADER_SCORE",
          value: score ? score.value : null,
          note: score?.note ?? null,
          scoredAt: score ? score.scoredAt.toISOString() : null,
          mandatory: rule.params.mandatory,
        },
      };
    }
    case "MANUAL": {
      const credit = person.credits.find((item) => item.ruleId === rule.id) ?? null;
      const achieved = cap(credit?.value ?? 0);
      return {
        ...base,
        achieved,
        remaining: leftover(achieved),
        detail: { type: "MANUAL", credited: credit?.value ?? null, reason: credit?.reason ?? null },
      };
    }
    default: {
      const never: never = rule;
      throw new Error(`cálculo desconocido: ${JSON.stringify(never)}`);
    }
  }
}

/** Estado abierto por margen (ADR-036 regla 4) o final como si cerrara hoy. */
export function stateFor(
  total: number,
  remaining: number,
  threshold: number,
  probationMargin: number,
  closed: boolean,
): PermanenceState {
  if (closed) {
    return finalStateFor(total, threshold, probationMargin);
  }
  const margin = round2(total + remaining - threshold);
  if (total >= threshold || margin >= probationMargin) {
    return "EN_CAMINO";
  }
  return margin >= 0 ? "EN_RIESGO" : "NO_ALCANZA";
}

export function finalStateFor(
  total: number,
  threshold: number,
  probationMargin: number,
): FinalState {
  if (total >= threshold) {
    return "CUMPLE";
  }
  return total >= threshold - probationMargin ? "PRUEBA" : "NO_CUMPLE";
}

function sum(values: number[]): number {
  return round2(values.reduce((acc, value) => acc + value, 0));
}

function mandatoryFor(facts: TermFacts, person: PersonFacts, now: Date): MandatoryView {
  const assemblies = facts.occasions.filter(
    (item) => item.kind === "ASSEMBLY" && item.assemblyKind !== null && item.status !== "CANCELLED",
  );
  const attendedOf = (kind: AssemblyKindName) =>
    assemblies.filter((item) => item.assemblyKind === kind && person.attended.has(item.id)).length;
  const upcomingOf = (kind: AssemblyKindName) =>
    assemblies.filter((item) => item.assemblyKind === kind && item.startsAt > now).length;
  const required = {
    ordinary: person.assemblyRequirement.requiredOrdinary,
    boardElection: person.assemblyRequirement.requiresBoardElection,
    runoff: person.assemblyRequirement.requiresRunoff,
  };
  const attended = {
    ordinary: attendedOf("ORDINARY"),
    boardElection: attendedOf("BOARD_ELECTION") > 0,
    runoff: attendedOf("RUNOFF") > 0,
  };
  const missing: AssemblyKindName[] = [];
  const lost: AssemblyKindName[] = [];
  if (attended.ordinary < required.ordinary) {
    missing.push("ORDINARY");
    if (attended.ordinary + upcomingOf("ORDINARY") < required.ordinary) {
      lost.push("ORDINARY");
    }
  }
  if (required.boardElection && !attended.boardElection) {
    missing.push("BOARD_ELECTION");
    if (upcomingOf("BOARD_ELECTION") === 0) {
      lost.push("BOARD_ELECTION");
    }
  }
  if (required.runoff && !attended.runoff) {
    missing.push("RUNOFF");
    if (upcomingOf("RUNOFF") === 0) {
      lost.push("RUNOFF");
    }
  }
  const upcoming = assemblies
    .filter((item) => item.startsAt > now && !person.attended.has(item.id))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 3)
    .map((item) => ({
      occasionId: item.id,
      title: item.title,
      startsAt: item.startsAt.toISOString(),
      assemblyKind: item.assemblyKind as AssemblyKindName,
    }));
  return { required, attended, met: missing.length === 0, missing, lost, upcoming };
}

/** El resultado completo de una persona en el término: general, por comité y obligatorias. */
export function computePerson(facts: TermFacts, person: PersonFacts, now: Date): PersonPermanence {
  const closed = facts.term.permanenceClosedAt !== null;
  const windowOpen = evaluationWindow(facts.term, facts.config, now).open;
  const options: ComputeOptions = { now, closed, windowOpen };
  const liveCommittees = person.committees.filter((item) => item.leftAt === null);
  const evaluated = person.status === "ACTIVE" && liveCommittees.length > 0;
  const applicable = facts.rules.filter((rule) => ruleApplies(rule.appliesTo, person.isNew));
  const generalRules = applicable
    .filter((rule) => rule.scope === "GENERAL")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const general = evaluated
    ? generalRules.map((rule) => computeCriterion(rule, facts, person, options))
    : [];
  const generalTotal = sum(general.map((item) => item.achieved));
  const generalRemaining = sum(general.map((item) => item.remaining));
  const generalMax = sum(generalRules.map((rule) => rule.weight));
  const results: CommitteeResult[] = evaluated
    ? liveCommittees.map((membership) => {
        const rules = applicable
          .filter(
            (rule) => rule.scope === "COMMITTEE" && rule.committeeId === membership.committeeId,
          )
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const criteria = rules.map((rule) => computeCriterion(rule, facts, person, options));
        const committeeTotal = sum(criteria.map((item) => item.achieved));
        const committeeRemaining = sum(criteria.map((item) => item.remaining));
        const total = round2(generalTotal + committeeTotal);
        const remaining = round2(generalRemaining + committeeRemaining);
        const shape = {
          isNew: person.isNew,
          probation: person.probation,
          transferredIn: membership.transferredIn,
        };
        const threshold = thresholdFor(shape, facts.config.thresholds);
        return {
          committeeId: membership.committeeId,
          transferredIn: membership.transferredIn,
          condition: conditionFor(shape),
          threshold,
          committeeTotal,
          committeeMax: sum(rules.map((rule) => rule.weight)),
          total,
          remaining,
          margin: round2(total + remaining - threshold),
          state: stateFor(total, remaining, threshold, facts.config.probationMargin, closed),
          finalState: finalStateFor(total, threshold, facts.config.probationMargin),
          criteria,
        };
      })
    : [];
  return {
    personId: person.personId,
    status: person.status,
    isNew: person.isNew,
    probation: person.probation,
    evaluated,
    general,
    generalTotal,
    generalMax,
    results,
    mandatory: mandatoryFor(facts, person, now),
  };
}

/** Motivo automático de una propuesta, en el orden de T-801. */
export type ProposalReason = 0 | 1 | 2 | 3 | 4;

export interface Proposal {
  committees: Array<{ committeeId: string; proposed: DecisionKind; reason: ProposalReason }>;
  person: { proposed: "CONTINUES" | "EXIT_OE"; reason: ProposalReason };
}

/** Propuesta del cierre (ADR-028): por comité según el estado final; por persona si no queda comité o faltó a una obligatoria. */
export function proposeDecisions(result: PersonPermanence): Proposal {
  const committees = result.results.map((item) => {
    if (item.finalState === "CUMPLE") {
      return { committeeId: item.committeeId, proposed: "CONTINUES" as const, reason: 0 as const };
    }
    if (item.finalState === "PRUEBA") {
      return { committeeId: item.committeeId, proposed: "PROBATION" as const, reason: 1 as const };
    }
    return {
      committeeId: item.committeeId,
      proposed: "EXIT_COMMITTEE" as const,
      reason: 2 as const,
    };
  });
  if (!result.mandatory.met) {
    return { committees, person: { proposed: "EXIT_OE", reason: 4 } };
  }
  const stays = committees.some((item) => item.proposed !== "EXIT_COMMITTEE");
  return {
    committees,
    person: stays ? { proposed: "CONTINUES", reason: 0 } : { proposed: "EXIT_OE", reason: 3 },
  };
}

/** Sumas de una tabla frente al nominal: veteranos (todos + veteranos) y nuevos (todos + nuevos). */
export function tableSums(rules: ReadonlyArray<Pick<Rule, "weight" | "appliesTo">>): {
  veterans: number;
  newcomers: number;
} {
  return {
    veterans: sum(rules.filter((r) => r.appliesTo !== "NEW").map((r) => r.weight)),
    newcomers: sum(rules.filter((r) => r.appliesTo !== "VETERAN").map((r) => r.weight)),
  };
}

/** Puntos de diferencia con el nominal a partir de los cuales el editor avisa (ADR-036 regla 3). */
export const NOMINAL_TOLERANCE = 5;

export function deviatesFromNominal(sumValue: number, nominal: number): boolean {
  return Math.abs(sumValue - nominal) >= NOMINAL_TOLERANCE;
}

export interface Distribution {
  people: number;
  enCamino: number;
  enRiesgo: number;
  noAlcanza: number;
  average: number;
}

/** Distribución de estados sobre los resultados por comité (vista previa del editor y junta). */
export function distribution(
  rows: ReadonlyArray<Pick<CommitteeResult, "state" | "total">>,
): Distribution {
  const people = rows.length;
  const totals = rows.map((row) => row.total);
  return {
    people,
    enCamino: rows.filter((row) => row.state === "EN_CAMINO" || row.state === "CUMPLE").length,
    enRiesgo: rows.filter((row) => row.state === "EN_RIESGO" || row.state === "PRUEBA").length,
    noAlcanza: rows.filter((row) => row.state === "NO_ALCANZA" || row.state === "NO_CUMPLE").length,
    average: people === 0 ? 0 : round2(totals.reduce((a, b) => a + b, 0) / people),
  };
}

export type NoticeKind =
  | "MID_TERM"
  | "CLOSING_WARNING"
  | "NO_ALCANZA"
  | "MANDATORY_ASSEMBLY"
  | "EVALUATIONS_PENDING"
  | "EVALUATION_WINDOW_CLOSED";

export interface Notice {
  kind: NoticeKind;
  committeeId?: string;
  occasionId?: string;
  values: Record<string, string | number>;
}

export interface NoticeContext {
  /** Cuántas evaluaciones tiene pendientes la persona como evaluadora (0 si no evalúa nada). */
  pendingEvaluations: number;
  isEvaluator: boolean;
}

/** Avisos que Mi OE muestra (ADR-036 regla 11); la fase 6 los manda por push y correo. */
export function noticesFor(
  term: TermLike,
  result: PersonPermanence,
  config: PermanenceConfig,
  now: Date,
  context: NoticeContext = { pendingEvaluations: 0, isEvaluator: false },
): Notice[] {
  const notices: Notice[] = [];
  const today = dayKey(now);
  const closed = term.permanenceClosedAt !== null;
  if (!closed) {
    const midpoint = addDays(
      term.startsOn,
      Math.floor(
        (new Date(`${term.endsOn}T00:00:00Z`).getTime() -
          new Date(`${term.startsOn}T00:00:00Z`).getTime()) /
          86_400_000 /
          2,
      ),
    );
    const daysLeft = Math.ceil(
      (new Date(`${term.endsOn}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
        86_400_000,
    );
    for (const item of result.results) {
      const values = {
        n: Math.round(item.total),
        umbral: item.threshold,
        m: Math.round(item.remaining),
        comité: item.committeeId,
      };
      if (item.state === "NO_ALCANZA") {
        notices.push({ kind: "NO_ALCANZA", committeeId: item.committeeId, values });
      } else if (daysLeft <= config.warningDays && item.total < item.threshold) {
        notices.push({ kind: "CLOSING_WARNING", committeeId: item.committeeId, values });
      } else if (today >= midpoint) {
        notices.push({ kind: "MID_TERM", committeeId: item.committeeId, values });
      }
    }
    for (const assembly of result.mandatory.upcoming) {
      const startsAt = new Date(assembly.startsAt).getTime();
      if (startsAt - now.getTime() <= 86_400_000) {
        notices.push({
          kind: "MANDATORY_ASSEMBLY",
          occasionId: assembly.occasionId,
          values: { asamblea: assembly.title, fecha: assembly.startsAt },
        });
      }
    }
  }
  if (context.isEvaluator) {
    const window = evaluationWindow(term, config, now);
    if (window.open && context.pendingEvaluations > 0) {
      notices.push({
        kind: "EVALUATIONS_PENDING",
        values: { n: context.pendingEvaluations, fecha: term.endsOn, término: term.code },
      });
    } else if (!window.open && !closed) {
      notices.push({ kind: "EVALUATION_WINDOW_CLOSED", values: { fecha: window.opensOn } });
    }
  }
  return notices;
}
