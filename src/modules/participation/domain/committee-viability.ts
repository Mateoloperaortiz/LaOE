import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  listAllCommittees,
  listCommitteeRoles,
  listLiveDirectionForTerm,
  listTermCommitteeMembers,
} from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { committeeAssemblyAttendance, occasion } from "../schema";
import {
  type ViabilityAlert,
  type ViabilityInput,
  viabilityAlerts,
} from "./committee-viability-pure";

// Viabilidad de los comités en el término (ADR-060 regla 8): compone los hechos de people
// (miembros y dirección), de participation (eventos propios y representación en asambleas) y de la
// ficha del comité (estado y prueba) para el tablero de ADMIN y la cabecera de cada comité.

export interface CommitteeViability {
  committeeId: string;
  committeeSlug: string;
  committeeName: string;
  status: "ACTIVE" | "INACTIVE" | "ON_TRIAL";
  trialEndsOn: string | null;
  input: ViabilityInput;
  alerts: ViabilityAlert[];
}

export async function listCommitteeViability(
  termId: string,
  now = new Date(),
): Promise<CommitteeViability[]> {
  const term = await getTerm(termId);
  if (!term) {
    return [];
  }
  const db = getDb();
  const [committees, roles, members, direction, events, attendance] = await Promise.all([
    listAllCommittees(),
    listCommitteeRoles(),
    listTermCommitteeMembers(termId),
    listLiveDirectionForTerm(termId),
    db
      .select({ committeeId: occasion.committeeId })
      .from(occasion)
      .where(
        and(
          eq(occasion.termId, termId),
          eq(occasion.status, "CLOSED"),
          eq(occasion.kind, "ACTIVITY"),
          ne(occasion.category, "COMMITTEE_MEETING"),
        ),
      ),
    db
      .select()
      .from(committeeAssemblyAttendance)
      .where(eq(committeeAssemblyAttendance.termId, termId)),
  ]);
  const requiredCodes = roles.filter((role) => role.required).map((role) => role.code);
  const todayKey = now.toISOString().slice(0, 10);
  const midpoint = new Date(
    (new Date(`${term.startsOn}T00:00:00Z`).getTime() +
      new Date(`${term.endsOn}T00:00:00Z`).getTime()) /
      2,
  );
  const pastMidterm = now >= midpoint;
  return committees
    .filter((committee) => committee.status !== "INACTIVE")
    .map((committee) => {
      const mine = members.filter(
        (item) =>
          item.committeeId === committee.id && item.leftAt === null && item.status === "ACTIVE",
      );
      const myDirection = direction.filter((item) => item.committeeId === committee.id);
      const directors = new Set(myDirection.map((item) => item.personId));
      const heldCodes = new Set(myDirection.map((item) => item.roleCode));
      const rows = attendance.filter((row) => row.committeeId === committee.id);
      const input: ViabilityInput = {
        status: committee.status,
        directions: heldCodes.size,
        missingRequired: requiredCodes.filter((code) => !heldCodes.has(code)).length,
        membersOutsideDirection: mine.filter((item) => !directors.has(item.personId)).length,
        unexcusedAbsences: rows.filter((row) => !row.represented && !row.excused).length,
        representedAssemblies: rows.filter((row) => row.represented).length,
        closedAssemblies: rows.length,
        eventsThisTerm: events.filter((row) => row.committeeId === committee.id).length,
        pastMidterm,
        trialEndsOn: committee.trialEndsOn,
        todayKey,
      };
      return {
        committeeId: committee.id,
        committeeSlug: committee.slug,
        committeeName: committee.name,
        status: committee.status,
        trialEndsOn: committee.trialEndsOn,
        input,
        alerts: mine.length === 0 ? [] : viabilityAlerts(input),
      };
    })
    .filter((row) => row.alerts.length > 0)
    .sort((a, b) => a.committeeName.localeCompare(b.committeeName, "es"));
}
