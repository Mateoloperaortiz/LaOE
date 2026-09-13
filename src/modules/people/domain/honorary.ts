import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listEditionRefs } from "@/modules/events";
import { listAllTerms } from "@/modules/terms";
import {
  appointment,
  committeeMembership,
  committeeRole,
  committeeRoleAssignment,
} from "../schema";
import type { HonoraryFacts } from "./honorary-pure";
import { BOARD_KINDS } from "./inhabilities";

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
      .select({ termId: committeeMembership.termId })
      .from(committeeMembership)
      .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt))),
  ]);
  const editionIds = appointments.flatMap((row) =>
    row.kind === "MACROEVENT_DIRECTOR" && row.editionId ? [row.editionId] : [],
  );
  const editions = await listEditionRefs(editionIds);
  return {
    terms: terms.map((term) => ({ id: term.id, code: term.code, endsOn: term.endsOn })),
    committeeRoles: roles,
    macroeventRoles: editionIds.map((id) => ({
      editionStartsAt: editions.get(id)?.startsAt ?? null,
    })),
    memberTermIds: memberships.map((row) => row.termId),
    boardTermIds: appointments
      .filter((row) => (BOARD_KINDS as readonly string[]).includes(row.kind))
      .map((row) => row.termId),
  };
}
