import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listAllTerms } from "@/modules/terms";
import { t } from "@/shared/copy";
import { committee, committeeMembership, committeeRole, committeeRoleAssignment } from "../schema";
import { type AppointmentView, appointmentLabel } from "./appointments";

/** Presentación del cargo: no cambia su tipo, sus permisos ni la acreditación institucional. */
export interface RoleHistoryEntry {
  id: string;
  appointmentId: string | null;
  termId: string;
  termCode: string;
  scope: string;
  label: string;
  endedAt: Date | null;
}

export function appointmentHistoryEntry(
  item: Pick<
    AppointmentView,
    | "id"
    | "kind"
    | "title"
    | "termId"
    | "termCode"
    | "committeeName"
    | "editionLabel"
    | "roleLabel"
    | "coDirector"
  >,
): RoleHistoryEntry {
  let scope = item.committeeName ?? t("T-2394");
  let label = appointmentLabel(item);
  if (item.kind === "MACROEVENT_DIRECTOR") {
    scope = item.editionLabel ?? t("T-2266");
    label = item.roleLabel
      ? item.coDirector
        ? t("T-2401", { cargo: item.roleLabel })
        : item.roleLabel
      : label;
  } else if (item.kind === "OTHER") {
    scope = item.committeeName ?? t("T-2395");
    // Algunos títulos históricos ya contienen «cargo · ámbito». Solo se separa su presentación:
    // no se deduce una edición, comité, elegibilidad ni permiso a partir del texto libre.
    const parts = item.title?.split(" · ").map((part) => part.trim());
    if (!item.committeeName && parts?.length === 2 && parts[0] && parts[1]) {
      [label, scope] = parts;
    }
  }
  return {
    id: `appointment:${item.id}`,
    appointmentId: item.id,
    termId: item.termId,
    termCode: item.termCode,
    scope,
    label,
    endedAt: null,
  };
}

/** Incluye cargos cerrados, que no aparecen en la lectura del roster vigente. */
export async function listCommitteeRoleHistory(personId: string): Promise<RoleHistoryEntry[]> {
  const terms = await listAllTerms();
  const termsById = new Map(terms.map((term) => [term.id, term.code]));
  const rows = await getDb()
    .select({
      id: committeeRoleAssignment.id,
      termId: committeeRoleAssignment.termId,
      scope: committee.name,
      label: committeeRole.label,
      roleCode: committeeRoleAssignment.roleCode,
      coDirector: committeeRoleAssignment.coDirector,
      endedAt: committeeRoleAssignment.endedAt,
      leftAt: committeeMembership.leftAt,
    })
    .from(committeeRoleAssignment)
    .innerJoin(committee, eq(committee.id, committeeRoleAssignment.committeeId))
    .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
    .innerJoin(
      committeeMembership,
      eq(committeeMembership.id, committeeRoleAssignment.membershipId),
    )
    .where(eq(committeeRoleAssignment.personId, personId));
  return rows
    .filter((row) => row.roleCode !== "MIEMBRO")
    .map((row) => ({
      id: `committee-role:${row.id}`,
      appointmentId: null,
      termId: row.termId,
      termCode: termsById.get(row.termId) ?? "",
      scope: row.scope,
      label: row.coDirector ? t("T-2144", { cargo: row.label }) : row.label,
      endedAt: row.endedAt ?? row.leftAt,
    }));
}

export function partitionRoleHistory(
  entries: readonly RoleHistoryEntry[],
  currentTerm: { id: string; code: string } | null,
  membershipLive: boolean,
) {
  const current: RoleHistoryEntry[] = [];
  const past: RoleHistoryEntry[] = [];
  const upcoming: RoleHistoryEntry[] = [];
  for (const entry of entries) {
    if (membershipLive && currentTerm && !entry.endedAt) {
      if (entry.termId === currentTerm.id) {
        current.push(entry);
        continue;
      }
      if (entry.termCode > currentTerm.code) {
        upcoming.push(entry);
        continue;
      }
    }
    past.push(entry);
  }
  return { current, past, upcoming };
}

export function groupRoleHistory(entries: readonly RoleHistoryEntry[]) {
  const semesters = new Map<
    string,
    { termCode: string; scopes: Map<string, RoleHistoryEntry[]> }
  >();
  for (const entry of entries) {
    const semester = semesters.get(entry.termId) ?? { termCode: entry.termCode, scopes: new Map() };
    const roles = semester.scopes.get(entry.scope) ?? [];
    roles.push(entry);
    semester.scopes.set(entry.scope, roles);
    semesters.set(entry.termId, semester);
  }
  return [...semesters]
    .map(([termId, semester]) => ({
      termId,
      termCode: semester.termCode,
      scopes: [...semester.scopes]
        .sort(([a], [b]) => a.localeCompare(b, "es"))
        .map(([scope, items]) => ({
          scope,
          items: items.sort(
            (a, b) => a.label.localeCompare(b.label, "es") || a.id.localeCompare(b.id),
          ),
        })),
    }))
    .sort((a, b) => b.termCode.localeCompare(a.termCode));
}
