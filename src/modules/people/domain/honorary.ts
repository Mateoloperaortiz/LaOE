import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listEditionRefs } from "@/modules/events";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import {
  appointment,
  committeeMembership,
  committeeRole,
  committeeRoleAssignment,
} from "../schema";
import { blockedBenefits } from "./benefits";
import type { HonoraryFacts } from "./honorary-pure";
import { BOARD_KINDS } from "./inhabilities";
import { isOnLeaveOnProbation } from "./membership";

// Los hechos de `people` para la elegibilidad a honorario (ADR-060 regla 13); los términos en comités
// de trabajo los agrega la app desde `permanence`, que no puede importarse desde aquí.

export async function honoraryFacts(
  personId: string,
): Promise<Omit<HonoraryFacts, "workCommitteeTermIds">> {
  const db = getDb();
  const [terms, roles, appointments, memberships] = await Promise.all([
    listAllTerms(),
    db
      .select({
        termId: committeeRoleAssignment.termId,
        startedAt: committeeRoleAssignment.startedAt,
        endedAt: committeeRoleAssignment.endedAt,
      })
      .from(committeeRoleAssignment)
      .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
      .where(
        and(eq(committeeRoleAssignment.personId, personId), eq(committeeRole.isLeadership, true)),
      ),
    db
      .select({
        kind: appointment.kind,
        termId: appointment.termId,
        editionId: appointment.editionId,
      })
      .from(appointment)
      .where(eq(appointment.personId, personId)),
    db
      .select({ termId: committeeMembership.termId, leftAt: committeeMembership.leftAt })
      .from(committeeMembership)
      .where(eq(committeeMembership.personId, personId)),
  ]);
  const editionIds = appointments.flatMap((row) =>
    row.kind === "MACROEVENT_DIRECTOR" && row.editionId ? [row.editionId] : [],
  );
  const editions = await listEditionRefs(editionIds);
  const current = await getCurrentTerm();
  const blocked = current ? await blockedBenefits([personId], current.id) : new Set<string>();
  // La prueba guardada al salir a licencia también bloquea, como en el comando (ADR-120 regla 4).
  const leftOnProbation = await isOnLeaveOnProbation(personId);
  const termEnds = new Map(terms.map((row) => [row.id, new Date(`${row.endsOn}T23:59:59-05:00`)]));
  return {
    benefitsBlocked: blocked.has(personId) || leftOnProbation,
    terms: terms.map((term) => ({ id: term.id, code: term.code, endsOn: term.endsOn })),
    committeeRoles: roles,
    macroeventRoles: editionIds.map((id) => ({
      editionStartsAt: editions.get(id)?.startsAt ?? null,
    })),
    memberTermIds: memberships
      .filter(
        (row) =>
          row.leftAt === null ||
          row.leftAt >= (termEnds.get(row.termId) ?? new Date(8640000000000000)),
      )
      .map((row) => row.termId),
    boardTermIds: appointments
      .filter((row) => (BOARD_KINDS as readonly string[]).includes(row.kind))
      .map((row) => row.termId),
  };
}
