import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { committeeMembership, committeeRoleAssignment, membership, person } from "../schema";

export function listMarketingDirectors(
  committeeId: string,
  termId: string,
  exec: Executor = getDb(),
) {
  return exec
    .select({ id: committeeRoleAssignment.id, personId: person.id, name: person.fullName })
    .from(committeeRoleAssignment)
    .innerJoin(
      committeeMembership,
      eq(committeeMembership.id, committeeRoleAssignment.membershipId),
    )
    .innerJoin(membership, eq(membership.personId, committeeRoleAssignment.personId))
    .innerJoin(person, eq(person.id, committeeRoleAssignment.personId))
    .where(
      and(
        eq(committeeRoleAssignment.roleCode, "MERCADEO"),
        eq(committeeRoleAssignment.committeeId, committeeId),
        eq(committeeRoleAssignment.termId, termId),
        isNull(committeeRoleAssignment.endedAt),
        isNull(committeeMembership.leftAt),
        isNull(person.anonymizedAt),
        inArray(membership.status, ["ACTIVE", "HONORARY"]),
      ),
    )
    .orderBy(asc(person.fullName));
}
