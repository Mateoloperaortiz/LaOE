import { listApprovedCheckInsForTerm, listOccasionsForTerm } from "@/modules/participation";
import { listCommitteesByIds, listTermRoster, type TermRosterRow } from "@/modules/people";
import { getTerm, listAllTerms } from "@/modules/terms";
import { tList } from "@/shared/copy";
import { type Distribution, distribution, round2 } from "./permanence-pure";
import { listSnapshots } from "./snapshots";

// Panel de la junta (ADR-036 regla 12): indicadores agregados del término sin nombres ni ids de
// personas. Se arma con las lecturas existentes de `people`, `participation` y los snapshots; los
// comités se nombran, las personas nunca.

export interface RetentionRow {
  termCode: string;
  /** Personas con alguna pertenencia a comité en el término. */
  withCommittee: number;
  /** De ellas, cuántas tienen pertenencia en el término siguiente (null si no hay siguiente). */
  continued: number | null;
  /** `continued / withCommittee` en porcentaje, null sin datos. */
  retention: number | null;
  /** Personas cuyo primer término es este. */
  newcomers: number;
}

export interface CommitteeIndicators {
  committeeId: string;
  committeeName: string;
  members: number;
  newcomers: number;
  enCamino: number;
  enRiesgo: number;
  noAlcanza: number;
  /** Reuniones del comité ya celebradas en el término. */
  meetings: number;
  /** Check-ins aprobados sobre elegibles × reuniones, en porcentaje; null sin reuniones. */
  attendance: number | null;
}

export interface CategoryIndicators {
  held: number;
  checkIns: number;
  /** Check-ins aprobados por ocasión celebrada; null sin ocasiones. */
  average: number | null;
}

export interface BoardIndicators {
  termId: string;
  termCode: string;
  cards: {
    active: number;
    newcomers: number;
    retention: number | null;
    enCamino: number;
    enRiesgo: number;
    noAlcanza: number;
    meetingAttendance: number | null;
    integrations: number;
    assemblies: number;
  };
  retention: RetentionRow[];
  committees: CommitteeIndicators[];
  integrations: CategoryIndicators;
  assemblies: CategoryIndicators;
  /** Distribución global de estados sobre las filas persona-comité del snapshot. */
  states: Distribution;
  computedAt: Date | null;
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function distinct(rows: TermRosterRow[]): Set<string> {
  return new Set(rows.map((row) => row.personId));
}

function alive(row: TermRosterRow, at: Date): boolean {
  return (row.joinedAt === null || row.joinedAt <= at) && (row.leftAt === null || row.leftAt > at);
}

/** Retención término a término: de quienes tenían comité en T, cuántos lo tienen en T+1 (T-826). */
export async function retentionByTerm(): Promise<RetentionRow[]> {
  const terms = (await listAllTerms()).slice().sort((a, b) => a.code.localeCompare(b.code));
  const rosters = new Map<string, TermRosterRow[]>();
  for (const term of terms) {
    rosters.set(term.id, await listTermRoster(term.id));
  }
  return terms.map((term, index) => {
    const rows = rosters.get(term.id) ?? [];
    const people = distinct(rows);
    const next = terms[index + 1];
    const nextPeople = next ? distinct(rosters.get(next.id) ?? []) : null;
    const continued = nextPeople ? [...people].filter((id) => nextPeople.has(id)).length : null;
    return {
      termCode: term.code,
      withCommittee: people.size,
      continued,
      retention: continued === null ? null : percent(continued, people.size),
      newcomers: distinct(rows.filter((row) => row.firstTermId === term.id)).size,
    };
  });
}

export async function boardIndicators(
  termId: string,
  now = new Date(),
): Promise<BoardIndicators | null> {
  const term = await getTerm(termId);
  if (!term) {
    return null;
  }
  const roster = await listTermRoster(termId);
  const snapshots = await listSnapshots(termId);
  const occasions = await listOccasionsForTerm(termId, ["OPEN", "CLOSED"]);
  const checkIns = await listApprovedCheckInsForTerm(termId);
  const retention = await retentionByTerm();
  const committeeIds = [...new Set(roster.map((row) => row.committeeId))];
  const names = new Map((await listCommitteesByIds(committeeIds)).map((c) => [c.id, c.name]));
  const held = occasions.filter((item) => item.startsAt <= now);
  const checkInsByOccasion = new Map<string, number>();
  for (const item of checkIns) {
    checkInsByOccasion.set(item.occasionId, (checkInsByOccasion.get(item.occasionId) ?? 0) + 1);
  }
  const committeeResults = snapshots
    .filter((item) => item.status === "ACTIVE")
    .flatMap((item) => item.results);
  const committees: CommitteeIndicators[] = committeeIds
    .map((committeeId) => {
      const rows = roster.filter((row) => row.committeeId === committeeId);
      const meetings = held.filter(
        (item) => item.category === "COMMITTEE_MEETING" && item.committeeId === committeeId,
      );
      let eligible = 0;
      let attended = 0;
      for (const meeting of meetings) {
        eligible += rows.filter((row) => alive(row, meeting.startsAt)).length;
        attended += checkInsByOccasion.get(meeting.id) ?? 0;
      }
      const states = distribution(committeeResults.filter((r) => r.committeeId === committeeId));
      return {
        committeeId,
        committeeName: names.get(committeeId) ?? "",
        members: distinct(rows.filter((row) => row.leftAt === null && row.status === "ACTIVE"))
          .size,
        newcomers: distinct(rows.filter((row) => row.firstTermId === termId)).size,
        enCamino: states.enCamino,
        enRiesgo: states.enRiesgo,
        noAlcanza: states.noAlcanza,
        meetings: meetings.length,
        attendance: meetings.length > 0 ? percent(attended, eligible) : null,
      };
    })
    .sort((a, b) => a.committeeName.localeCompare(b.committeeName, "es"));
  const category = (rows: typeof held): CategoryIndicators => {
    const total = rows.reduce((acc, item) => acc + (checkInsByOccasion.get(item.id) ?? 0), 0);
    return {
      held: rows.length,
      checkIns: total,
      average: rows.length > 0 ? round2(total / rows.length) : null,
    };
  };
  const integrations = category(held.filter((item) => item.category === "INTEGRATION"));
  const assemblies = category(held.filter((item) => item.kind === "ASSEMBLY"));
  const states = distribution(committeeResults);
  const meetingTotals = committees.reduce(
    (acc, item) => {
      if (item.attendance !== null) {
        acc.sum += item.attendance * item.meetings;
        acc.weight += item.meetings;
      }
      return acc;
    },
    { sum: 0, weight: 0 },
  );
  const previous = retention.find((_row, index) => retention[index + 1]?.termCode === term.code);
  return {
    termId,
    termCode: term.code,
    cards: {
      active: distinct(roster.filter((row) => row.status === "ACTIVE" && row.leftAt === null)).size,
      newcomers: distinct(roster.filter((row) => row.firstTermId === termId)).size,
      retention: previous?.retention ?? null,
      enCamino: states.enCamino,
      enRiesgo: states.enRiesgo,
      noAlcanza: states.noAlcanza,
      meetingAttendance:
        meetingTotals.weight > 0 ? Math.round(meetingTotals.sum / meetingTotals.weight) : null,
      integrations: integrations.held,
      assemblies: assemblies.held,
    },
    retention,
    committees,
    integrations,
    assemblies,
    states,
    computedAt: snapshots.reduce<Date | null>(
      (acc, item) => (acc === null || item.computedAt > acc ? item.computedAt : acc),
      null,
    ),
  };
}

export interface BoardExportRow {
  id: string;
  indicator: string;
  committee: string;
  term: string;
  value: number | string;
}

/**
 * Formato largo para el CSV de la junta (T-837): un indicador por fila, sin personas. Las etiquetas son
 * las de la pantalla (T-823, T-825 y T-828) y se toman acá: el exporte y el aviso del tope de la
 * pantalla cuentan las mismas filas porque las arma la misma llamada (ADR-121 regla 12).
 */
export function boardExportRows(data: BoardIndicators): BoardExportRow[] {
  const labels = { cards: tList("T-823"), retention: tList("T-825"), committees: tList("T-828") };
  const rows: BoardExportRow[] = [];
  const push = (indicator: string, committee: string, term: string, value: number | null) => {
    rows.push({
      id: `${indicator}:${committee}:${term}`,
      indicator,
      committee,
      term,
      value: value ?? "",
    });
  };
  const card = (index: number) => labels.cards[index] ?? String(index);
  push(card(0), "", data.termCode, data.cards.active);
  push(card(1), "", data.termCode, data.cards.newcomers);
  push(card(2), "", data.termCode, data.cards.retention);
  push(card(3), "", data.termCode, data.cards.enCamino);
  push(card(4), "", data.termCode, data.cards.enRiesgo);
  push(card(5), "", data.termCode, data.cards.noAlcanza);
  push(card(6), "", data.termCode, data.cards.meetingAttendance);
  push(card(7), "", data.termCode, data.cards.integrations);
  push(card(8), "", data.termCode, data.cards.assemblies);
  for (const row of data.retention) {
    push(labels.retention[1] ?? "", "", row.termCode, row.withCommittee);
    push(labels.retention[2] ?? "", "", row.termCode, row.continued);
    push(labels.retention[3] ?? "", "", row.termCode, row.retention);
    push(labels.retention[4] ?? "", "", row.termCode, row.newcomers);
  }
  for (const item of data.committees) {
    push(labels.committees[1] ?? "", item.committeeName, data.termCode, item.members);
    push(labels.committees[2] ?? "", item.committeeName, data.termCode, item.enCamino);
    push(labels.committees[3] ?? "", item.committeeName, data.termCode, item.enRiesgo);
    push(labels.committees[4] ?? "", item.committeeName, data.termCode, item.noAlcanza);
    push(labels.committees[5] ?? "", item.committeeName, data.termCode, item.meetings);
    push(labels.committees[6] ?? "", item.committeeName, data.termCode, item.attendance);
  }
  return rows;
}
