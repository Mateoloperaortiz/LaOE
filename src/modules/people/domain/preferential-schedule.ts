import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { t, tList } from "@/shared/copy";
import {
  appointment,
  committee,
  committeeRole,
  committeeRoleAssignment,
  macroeventRole,
  person,
} from "../schema";
import { APPOINTMENT_KINDS, editionLabelsFor } from "./appointments";
import { BOARD_KINDS } from "./inhabilities";

// Horario preferencial (Regl. art. 72; ADR-060 regla 13): junta, mesas directivas (máximo seis por
// comité, titulares antes que codirecciones) y directores de macroevento del término. Es un exporte
// con datos personales: correo institucional para acreditarlo ante la Universidad.

/** Máximo de personas con horario preferencial por CIC o CE (Regl. art. 72). */
export const MAX_PREFERENTIAL_PER_COMMITTEE = 6;

export interface PreferentialRow {
  id: string;
  personId: string;
  name: string;
  email: string;
  kind: "BOARD" | "COMMITTEE" | "MACROEVENT";
  scope: string;
  roleLabel: string;
}

export async function listPreferentialSchedule(termId: string): Promise<PreferentialRow[]> {
  const db = getDb();
  const [, , , , , junta] = tList("T-2323");
  const [appointments, roles] = await Promise.all([
    db
      .select({
        id: appointment.id,
        personId: appointment.personId,
        kind: appointment.kind,
        editionId: appointment.editionId,
        roleLabel: macroeventRole.label,
        coDirector: appointment.coDirector,
        name: person.fullName,
        email: person.email,
      })
      .from(appointment)
      .innerJoin(person, eq(person.id, appointment.personId))
      .leftJoin(macroeventRole, eq(macroeventRole.code, appointment.roleCode))
      .where(
        and(
          eq(appointment.termId, termId),
          inArray(appointment.kind, [...BOARD_KINDS, "MACROEVENT_DIRECTOR"]),
        ),
      ),
    db
      .select({
        id: committeeRoleAssignment.id,
        personId: committeeRoleAssignment.personId,
        committeeId: committeeRoleAssignment.committeeId,
        committeeName: committee.name,
        roleLabel: committeeRole.label,
        sortOrder: committeeRole.sortOrder,
        coDirector: committeeRoleAssignment.coDirector,
        name: person.fullName,
        email: person.email,
      })
      .from(committeeRoleAssignment)
      .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
      .innerJoin(committee, eq(committee.id, committeeRoleAssignment.committeeId))
      .innerJoin(person, eq(person.id, committeeRoleAssignment.personId))
      .where(
        and(
          eq(committeeRoleAssignment.termId, termId),
          isNull(committeeRoleAssignment.endedAt),
          eq(committeeRole.isLeadership, true),
        ),
      )
      .orderBy(
        asc(committee.name),
        asc(committeeRoleAssignment.coDirector),
        asc(committeeRole.sortOrder),
      ),
  ]);
  const editions = await editionLabelsFor(appointments.map((row) => row.editionId));
  const boardLabels = tList("T-444");
  const rows: PreferentialRow[] = appointments.map((row) => ({
    id: row.id,
    personId: row.personId,
    name: row.name ?? "",
    email: row.email,
    kind: row.kind === "MACROEVENT_DIRECTOR" ? "MACROEVENT" : "BOARD",
    scope:
      row.kind === "MACROEVENT_DIRECTOR"
        ? row.editionId
          ? (editions.get(row.editionId) ?? "")
          : ""
        : (junta ?? ""),
    roleLabel:
      row.kind === "MACROEVENT_DIRECTOR"
        ? row.coDirector
          ? t("T-2144", { cargo: row.roleLabel ?? "" })
          : (row.roleLabel ?? "")
        : (boardLabels[APPOINTMENT_KINDS.indexOf(row.kind)] ?? row.kind),
  }));
  // Mesa directiva: máximo seis personas por comité, una sola vez cada una.
  const perCommittee = new Map<string, Set<string>>();
  for (const row of roles) {
    const seen = perCommittee.get(row.committeeId) ?? new Set<string>();
    if (seen.has(row.personId) || seen.size >= MAX_PREFERENTIAL_PER_COMMITTEE) {
      continue;
    }
    seen.add(row.personId);
    perCommittee.set(row.committeeId, seen);
    rows.push({
      id: row.id,
      personId: row.personId,
      name: row.name ?? "",
      email: row.email,
      kind: "COMMITTEE",
      scope: row.committeeName,
      roleLabel: row.coDirector ? t("T-2144", { cargo: row.roleLabel }) : row.roleLabel,
    });
  }
  return rows.sort(
    (a, b) =>
      ["BOARD", "COMMITTEE", "MACROEVENT"].indexOf(a.kind) -
        ["BOARD", "COMMITTEE", "MACROEVENT"].indexOf(b.kind) ||
      a.scope.localeCompare(b.scope, "es") ||
      a.name.localeCompare(b.name, "es"),
  );
}

export function preferentialKindLabel(kind: PreferentialRow["kind"]): string {
  const [, , , , , junta, mesa, macro] = tList("T-2323");
  return (kind === "BOARD" ? junta : kind === "COMMITTEE" ? mesa : macro) ?? kind;
}
