import { cache } from "react";
import { getPeopleByIds, listCommitteesByIds } from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { mandatoryCounts } from "./mandatory-counts";
import type { CommitteeResult, PermanenceState } from "./permanence-pure";
import { listSnapshots, type SnapshotView } from "./snapshots";

// Cumplimiento (12-permanencia, "Lo que ve GH"): una fila por persona y comité a partir de los
// snapshots, con nombres resueltos, filtros de GH y el CSV con datos personales.

export const COMPLIANCE_FILTERS = [
  "todos",
  "por-debajo",
  "no-alcanza",
  "prueba",
  "nuevos",
  "exentos",
] as const;
export type ComplianceFilter = (typeof COMPLIANCE_FILTERS)[number];

export interface ComplianceRow {
  id: string;
  personId: string;
  personName: string;
  email: string;
  status: SnapshotView["status"];
  isNew: boolean;
  probation: boolean;
  /** null cuando la persona está exenta (sin resultados). */
  committeeId: string | null;
  committeeName: string;
  condition: CommitteeResult["condition"] | null;
  generalTotal: number;
  committeeTotal: number;
  total: number;
  threshold: number;
  remaining: number;
  state: PermanenceState | null;
  mandatoryMet: boolean;
  mandatoryAttended: number;
  mandatoryTotal: number;
  computedAt: Date;
  frozenAt: Date | null;
}

function matches(row: ComplianceRow, filter: ComplianceFilter): boolean {
  switch (filter) {
    case "por-debajo":
      return row.state !== null && row.total < row.threshold;
    case "no-alcanza":
      return row.state === "NO_ALCANZA" || row.state === "NO_CUMPLE";
    case "prueba":
      return row.probation || row.state === "PRUEBA";
    case "nuevos":
      return row.isNew && row.state !== null;
    case "exentos":
      return row.state === null;
    default:
      return true;
  }
}

/**
 * Los snapshots del término para una pantalla: Cumplimiento pide las filas y el resumen a la vez, y
 * dentro de un render comparten la lectura (ADR-121 regla 11). Fuera de un render, cada llamada lee.
 */
const snapshotsForRender = cache((termId: string) => listSnapshots(termId));

/** Todas las filas del término, ordenadas por nombre y comité. */
export async function listCompliance(
  termId: string,
  filter: ComplianceFilter = "todos",
): Promise<ComplianceRow[]> {
  const snapshots = await snapshotsForRender(termId);
  const people = await getPeopleByIds(snapshots.map((item) => item.personId));
  const committeeIds = [
    ...new Set(snapshots.flatMap((item) => item.results.map((result) => result.committeeId))),
  ];
  const committees = new Map(
    (await listCommitteesByIds(committeeIds)).map((item) => [item.id, item.name]),
  );
  const rows: ComplianceRow[] = [];
  for (const view of snapshots) {
    const person = people.get(view.personId);
    const mandatory = mandatoryCounts(view.mandatory);
    const base = {
      personId: view.personId,
      personName: person?.fullName ?? "",
      email: person?.email ?? "",
      status: view.status,
      isNew: view.isNew,
      probation: view.probation,
      generalTotal: view.generalTotal,
      mandatoryMet: view.mandatory.met,
      mandatoryAttended: mandatory.attended,
      mandatoryTotal: mandatory.total,
      computedAt: view.computedAt,
      frozenAt: view.frozenAt,
    };
    if (view.results.length === 0 || view.status !== "ACTIVE") {
      rows.push({
        ...base,
        id: view.personId,
        committeeId: null,
        committeeName: "",
        condition: null,
        committeeTotal: 0,
        total: view.generalTotal,
        threshold: 0,
        remaining: 0,
        state: null,
      });
      continue;
    }
    for (const result of view.results) {
      rows.push({
        ...base,
        id: `${view.personId}:${result.committeeId}`,
        committeeId: result.committeeId,
        committeeName: committees.get(result.committeeId) ?? "",
        condition: result.condition,
        committeeTotal: result.committeeTotal,
        total: result.total,
        threshold: result.threshold,
        remaining: result.remaining,
        state: result.state,
      });
    }
  }
  return rows
    .filter((row) => matches(row, filter))
    .sort(
      (a, b) =>
        a.personName.localeCompare(b.personName, "es") ||
        a.committeeName.localeCompare(b.committeeName, "es"),
    );
}

export interface ComplianceSummary {
  computedAt: Date | null;
  people: number;
}

export async function complianceSummary(termId: string): Promise<ComplianceSummary> {
  const snapshots = await snapshotsForRender(termId);
  const latest = snapshots.reduce<Date | null>(
    (acc, item) => (acc === null || item.computedAt > acc ? item.computedAt : acc),
    null,
  );
  return { computedAt: latest, people: snapshots.length };
}

/** Para el kit: filtra por término (obligatorio) y por el filtro de GH, con búsqueda por nombre. */
export async function listComplianceForExport(params: {
  q: string;
  termId: string | undefined;
  filter: string | undefined;
  page: number;
  pageSize: number;
}): Promise<{ rows: ComplianceRow[]; total: number }> {
  const termId = params.termId;
  if (!termId || !(await getTerm(termId))) {
    return { rows: [], total: 0 };
  }
  const filter = COMPLIANCE_FILTERS.includes(params.filter as ComplianceFilter)
    ? (params.filter as ComplianceFilter)
    : "todos";
  const q = params.q.trim().toLowerCase();
  const rows = (await listCompliance(termId, filter)).filter(
    (row) => !q || row.personName.toLowerCase().includes(q) || row.email.toLowerCase().includes(q),
  );
  const start = (params.page - 1) * params.pageSize;
  return { rows: rows.slice(start, start + params.pageSize), total: rows.length };
}
