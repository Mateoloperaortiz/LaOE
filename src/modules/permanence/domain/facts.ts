import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import {
  assemblyAdjustmentsFor,
  listApprovedCheckInsForPersonInTerm,
  listApprovedCheckInsForTerm,
  listExcusedCheckInsForPersonInTerm,
  listExcusedCheckInsForTerm,
  listOccasionsForTerm,
  termAssemblyRequirement,
} from "@/modules/participation";
import { listExpulsionWarnings, listTermRoster, type TermRosterRow } from "@/modules/people";
import { type ConfigKey, requireConfig } from "@/modules/system";
import { getTerm, type TermRow } from "@/modules/terms";
import {
  leaderScore,
  manualCredit,
  permanenceBonus,
  permanenceBonusAllocation,
  permanenceRule,
  workGroup,
  workGroupEvaluator,
  workGroupMembership,
} from "../schema";
import { probationMarginsForTerm } from "./normative-policy-pure";
import { toRule } from "./params";
import {
  type AssemblyRequirementFact,
  type GroupFact,
  type OccasionFact,
  type PermanenceConfig,
  type PersonFacts,
  personStanding,
  type TermFacts,
} from "./permanence-pure";

// Cargadores de hechos (ADR-036 regla 5): todo lo que el cálculo necesita, leído en serie (pool de
// diez) desde los módulos por su API pública y desde las tablas propias. Acá se lee y se arma; lo
// que se decide con lo leído vive en `permanence-pure.ts`: con qué estado, condición de nuevo y prueba
// llega la persona lo dice `personStanding`. Quién es nuevo ya viene decidido en el roster de `people`.

export async function loadPermanenceConfig(
  termCode?: string,
  exec?: Executor,
): Promise<PermanenceConfig> {
  const config = <K extends ConfigKey>(key: K) => requireConfig(key, exec);
  return {
    thresholds: {
      active: await config("permanence.threshold.active"),
      new: await config("permanence.threshold.new"),
      probation: await config("permanence.threshold.probation"),
      transfer: await config("permanence.threshold.transfer"),
    },
    probationMargins: probationMarginsForTerm(
      termCode,
      await config("permanence.probationMargins"),
      await config("permanence.probationMargins2026"),
    ),
    evaluationWindowDays: await config("permanence.evaluationWindowDays"),
    warningDays: await config("permanence.warningDays"),
  };
}

export async function loadGroups(termId: string, db: Executor = getDb()): Promise<GroupFact[]> {
  const groups = await db
    .select({
      id: workGroup.id,
      kind: workGroup.kind,
      code: workGroup.code,
      name: workGroup.name,
      macroeventId: workGroup.eventId,
    })
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

export async function loadRules(termId: string, exec: Executor = getDb()) {
  const rows = await exec
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

/**
 * Los hechos del término: reglas, ocasiones, grupos y configuración; null si el término no existe.
 * Quien ya leyó el término lo pasa entero y no se vuelve a leer (ADR-121 regla 11).
 */
export function loadTermFacts(term: TermRow, exec?: Executor): Promise<TermFacts>;
export function loadTermFacts(
  termOrId: string | TermRow,
  exec?: Executor,
): Promise<TermFacts | null>;
export async function loadTermFacts(
  termOrId: string | TermRow,
  exec?: Executor,
): Promise<TermFacts | null> {
  const db = exec ?? getDb();
  const term = typeof termOrId === "string" ? await getTerm(termOrId, db) : termOrId;
  if (!term) {
    return null;
  }
  const termId = term.id;
  const config = await loadPermanenceConfig(term.code, exec);
  const rules = await loadRules(termId, db);
  const occasions: OccasionFact[] = (await listOccasionsForTerm(termId, undefined, db)).map(
    (row) => ({
      id: row.id,
      title: row.title,
      location: row.location,
      kind: row.kind,
      assemblyKind: row.assemblyKind,
      category: row.category,
      committeeId: row.committeeId,
      newMembersOnly: row.newMembersOnly,
      startsAt: row.startsAt,
      status: row.status,
    }),
  );
  const groups = await loadGroups(termId, db);
  return {
    term: {
      id: term.id,
      code: term.code,
      semester: term.semester,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      requiredOrdinaryAssemblies: term.requiredOrdinaryAssemblies,
      generalNominal: term.permanenceGeneralNominal,
      committeeNominal: term.permanenceCommitteeNominal,
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

async function occasionsByPerson(
  termId: string,
  personIds: string[] | undefined,
  exec: Executor,
  forPerson: (personId: string, termId: string, exec: Executor) => Promise<string[]>,
  forTerm: (
    termId: string,
    exec: Executor,
  ) => Promise<Array<{ personId: string; occasionId: string }>>,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (personIds) {
    for (const personId of personIds) {
      map.set(personId, new Set(await forPerson(personId, termId, exec)));
    }
    return map;
  }
  for (const row of await forTerm(termId, exec)) {
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
  db: Executor = getDb(),
): Promise<PersonFacts[]> {
  const termId = facts.term.id;
  const roster = groupRoster(await listTermRoster(termId, personIds, db));
  const ids = [...roster.keys()];
  if (ids.length === 0) {
    return [];
  }
  const attended = await occasionsByPerson(
    termId,
    personIds,
    db,
    listApprovedCheckInsForPersonInTerm,
    listApprovedCheckInsForTerm,
  );
  // Ocasiones con excusa aceptada (ADR-060 regla 5): no cuentan como falta.
  const excused = await occasionsByPerson(
    termId,
    personIds,
    db,
    listExcusedCheckInsForPersonInTerm,
    listExcusedCheckInsForTerm,
  );
  // Sanciones vivas al cerrar el término (ADR-060 regla 6).
  const warned = await listExpulsionWarnings(facts.term.endsOn, ids, db);
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
  const bonusRows = await db
    .select({
      personId: permanenceBonus.personId,
      id: permanenceBonus.id,
      ruleId: permanenceBonusAllocation.ruleId,
      value: permanenceBonusAllocation.value,
      reason: permanenceBonus.reason,
    })
    .from(permanenceBonus)
    .innerJoin(permanenceBonusAllocation, eq(permanenceBonusAllocation.bonusId, permanenceBonus.id))
    .where(and(eq(permanenceBonus.termId, termId), inArray(permanenceBonus.personId, ids)))
    .orderBy(asc(permanenceBonus.createdAt), asc(permanenceBonus.id));
  const bonuses = new Map<string, PersonFacts["bonuses"]>();
  for (const { personId, ...bonus } of bonusRows) {
    const list = bonuses.get(personId) ?? [];
    list.push(bonus);
    bonuses.set(personId, list);
  }
  // El requisito «del término» sale de las ocasiones que ya se leyeron, con la misma función que usa
  // `participation` para su mesa de asambleas (ADR-123 regla 13).
  const fallback: AssemblyRequirementFact = termAssemblyRequirement(facts.term, facts.occasions);
  // Solo los ajustes de las personas pedidas: antes se leía el cumplimiento de todos los activos de la
  // OE para quedarse con el requisito de cada una (ADR-121 regla 3).
  const adjustments = await assemblyAdjustmentsFor(termId, ids, db);
  return ids.map((personId) => {
    const rows = roster.get(personId) ?? [];
    const standing = personStanding(rows);
    const adjustment = standing.status === "ACTIVE" ? adjustments.get(personId) : undefined;
    return {
      personId,
      ...standing,
      committees: rows.map((row) => ({
        committeeId: row.committeeId,
        roleCode: row.roleCode,
        transferredIn: row.transferredIn,
        probation: row.committeeProbation,
        reportAsVeteran: row.committeeReportAsVeteran,
        joinedAt: row.joinedAt,
        leftAt: row.leftAt,
      })),
      attended: attended.get(personId) ?? new Set(),
      excused: excused.get(personId) ?? new Set(),
      expulsionWarning: warned.has(personId),
      groupMemberships: memberships
        .filter((item) => item.personId === personId)
        .map(({ personId: _p, ...rest }) => rest),
      leaderScores: scores
        .filter((item) => item.personId === personId)
        .map(({ personId: _p, ...rest }) => rest),
      credits: credits
        .filter((item) => item.personId === personId)
        .map(({ personId: _p, ...rest }) => rest),
      bonuses: bonuses.get(personId) ?? [],
      // El ajuste es del miembro activo. Quien no lo está llega con el requisito del término aunque
      // tenga un ajuste: así lo entregaba la lectura de toda la OE, que solo traía activos.
      assemblyRequirement: adjustment
        ? {
            ...adjustment,
            requiredRunoffs: adjustment.requiresRunoff
              ? Math.max(1, fallback.requiredRunoffs ?? 0)
              : 0,
          }
        : fallback,
    };
  });
}
