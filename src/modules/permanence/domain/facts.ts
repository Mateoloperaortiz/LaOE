import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  assemblyOverview,
  defaultRequirement,
  listApprovedCheckInsForPersonInTerm,
  listApprovedCheckInsForTerm,
  listOccasionsForTerm,
} from "@/modules/participation";
import { listTermRoster, type TermRosterRow } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { getTerm } from "@/modules/terms";
import {
  leaderScore,
  manualCredit,
  permanenceRule,
  workGroup,
  workGroupEvaluator,
  workGroupMembership,
} from "../schema";
import { toRule } from "./params";
import type {
  AssemblyRequirementFact,
  GroupFact,
  OccasionFact,
  PermanenceConfig,
  PersonFacts,
  TermFacts,
} from "./permanence-pure";

// Cargadores de hechos (ADR-036 regla 5): todo lo que el cálculo necesita, leído en serie (pool de
// diez) desde los módulos por su API pública y desde las tablas propias. Sin lógica de negocio.

export async function loadPermanenceConfig(): Promise<PermanenceConfig> {
  return {
    thresholds: {
      active: await requireConfig("permanence.threshold.active"),
      new: await requireConfig("permanence.threshold.new"),
      probation: await requireConfig("permanence.threshold.probation"),
      transfer: await requireConfig("permanence.threshold.transfer"),
    },
    probationMargin: await requireConfig("permanence.probationMargin"),
    evaluationWindowDays: await requireConfig("permanence.evaluationWindowDays"),
    warningDays: await requireConfig("permanence.warningDays"),
  };
}

export async function loadGroups(termId: string): Promise<GroupFact[]> {
  const db = getDb();
  const groups = await db
    .select({ id: workGroup.id, kind: workGroup.kind, code: workGroup.code, name: workGroup.name })
    .from(workGroup)
    .where(eq(workGroup.termId, termId))
    .orderBy(asc(workGroup.name));
  if (groups.length === 0) {
    return [];
  }
  const evaluators = await db
    .select({ groupId: workGroupEvaluator.groupId, personId: workGroupEvaluator.personId })
    .from(workGroupEvaluator)
    .where(
      inArray(
        workGroupEvaluator.groupId,
        groups.map((item) => item.id),
      ),
    );
  const byGroup = new Map<string, string[]>();
  for (const row of evaluators) {
    byGroup.set(row.groupId, [...(byGroup.get(row.groupId) ?? []), row.personId]);
  }
  return groups.map((item) => ({ ...item, evaluatorIds: byGroup.get(item.id) ?? [] }));
}

export async function loadRules(termId: string) {
  const rows = await getDb()
    .select()
    .from(permanenceRule)
    .where(eq(permanenceRule.termId, termId))
    .orderBy(
      asc(permanenceRule.scope),
      asc(permanenceRule.committeeId),
      asc(permanenceRule.sortOrder),
    );
  return rows.map((row) => toRule(row));
}

/** Los hechos del término: reglas, ocasiones, grupos y configuración; null si el término no existe. */
export async function loadTermFacts(termId: string): Promise<TermFacts | null> {
  const term = await getTerm(termId);
  if (!term) {
    return null;
  }
  const config = await loadPermanenceConfig();
  const rules = await loadRules(termId);
  const occasions: OccasionFact[] = (await listOccasionsForTerm(termId)).map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    assemblyKind: row.assemblyKind,
    category: row.category,
    committeeId: row.committeeId,
    newMembersOnly: row.newMembersOnly,
    startsAt: row.startsAt,
    status: row.status,
  }));
  const groups = await loadGroups(termId);
  return {
    term: {
      id: term.id,
      code: term.code,
      semester: term.semester,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      requiredOrdinaryAssemblies: term.requiredOrdinaryAssemblies,
      pointsClosedAt: term.pointsClosedAt,
      permanenceClosedAt: term.permanenceClosedAt,
    },
    config,
    rules,
    occasions,
    groups,
  };
}

function groupRoster(rows: TermRosterRow[]): Map<string, TermRosterRow[]> {
  const map = new Map<string, TermRosterRow[]>();
  for (const row of rows) {
    map.set(row.personId, [...(map.get(row.personId) ?? []), row]);
  }
  return map;
}

async function attendedByPerson(
  termId: string,
  personIds: string[] | undefined,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (personIds) {
    for (const personId of personIds) {
      map.set(personId, new Set(await listApprovedCheckInsForPersonInTerm(personId, termId)));
    }
    return map;
  }
  for (const row of await listApprovedCheckInsForTerm(termId)) {
    const set = map.get(row.personId) ?? new Set<string>();
    set.add(row.occasionId);
    map.set(row.personId, set);
  }
  return map;
}

/**
 * Los hechos de las personas del término (todas, o solo `personIds`): pertenencias con condición,
 * check-ins aprobados, grupos, puntajes, créditos y requisito de asambleas.
 */
export async function loadPeopleFacts(
  facts: TermFacts,
  personIds?: string[],
): Promise<PersonFacts[]> {
  const termId = facts.term.id;
  const roster = groupRoster(await listTermRoster(termId, personIds));
  const ids = [...roster.keys()];
  if (ids.length === 0) {
    return [];
  }
  const db = getDb();
  const attended = await attendedByPerson(termId, personIds);
  const memberships = await db
    .select({
      personId: workGroupMembership.personId,
      groupId: workGroupMembership.groupId,
      evaluation: workGroupMembership.evaluation,
      leftAt: workGroupMembership.leftAt,
      evaluatedById: workGroupMembership.evaluatedById,
      evaluatedAt: workGroupMembership.evaluatedAt,
      note: workGroupMembership.note,
    })
    .from(workGroupMembership)
    .innerJoin(workGroup, eq(workGroup.id, workGroupMembership.groupId))
    .where(and(eq(workGroup.termId, termId), inArray(workGroupMembership.personId, ids)));
  const scores = await db
    .select({
      personId: leaderScore.personId,
      ruleId: leaderScore.ruleId,
      value: leaderScore.value,
      note: leaderScore.note,
      scoredAt: leaderScore.scoredAt,
    })
    .from(leaderScore)
    .where(and(eq(leaderScore.termId, termId), inArray(leaderScore.personId, ids)));
  const credits = await db
    .select({
      personId: manualCredit.personId,
      ruleId: manualCredit.ruleId,
      value: manualCredit.value,
      reason: manualCredit.reason,
    })
    .from(manualCredit)
    .where(and(eq(manualCredit.termId, termId), inArray(manualCredit.personId, ids)));
  const hasRunoff = facts.occasions.some(
    (item) => item.assemblyKind === "RUNOFF" && item.status !== "CANCELLED",
  );
  const fallback: AssemblyRequirementFact = defaultRequirement(facts.term, hasRunoff);
  const requirements = new Map<string, AssemblyRequirementFact>();
  for (const row of await assemblyOverview(facts.term)) {
    requirements.set(row.personId, row.requirement);
  }
  return ids.map((personId) => {
    const rows = roster.get(personId) ?? [];
    const first = rows[0];
    return {
      personId,
      status: first?.status ?? "INACTIVE",
      isNew: first?.firstTermId === termId,
      probation: first?.probation ?? false,
      committees: rows.map((row) => ({
        committeeId: row.committeeId,
        roleCode: row.roleCode,
        transferredIn: row.transferredIn,
        joinedAt: row.joinedAt,
        leftAt: row.leftAt,
      })),
      attended: attended.get(personId) ?? new Set(),
      groupMemberships: memberships
        .filter((item) => item.personId === personId)
        .map(({ personId: _p, ...rest }) => rest),
      leaderScores: scores
        .filter((item) => item.personId === personId)
        .map(({ personId: _p, ...rest }) => rest),
      credits: credits
        .filter((item) => item.personId === personId)
        .map(({ personId: _p, ...rest }) => rest),
      assemblyRequirement: requirements.get(personId) ?? fallback,
    };
  });
}
