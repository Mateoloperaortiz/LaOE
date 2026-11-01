import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Executor } from "@/db/tx";
import { workGroup, workGroupMembership } from "../schema";

/** El líder pertenece al equipo; evaluar o tener un permiso global no concede este acceso. */
export async function listAvailabilityWorkGroups(exec: Executor, personId: string, termId: string) {
  const own = exec
    .select({ id: workGroupMembership.groupId })
    .from(workGroupMembership)
    .where(and(eq(workGroupMembership.personId, personId), isNull(workGroupMembership.leftAt)));
  const groups = await exec
    .select({ id: workGroup.id, name: workGroup.name, leaderPersonId: workGroup.leaderPersonId })
    .from(workGroup)
    .where(
      and(
        eq(workGroup.termId, termId),
        or(eq(workGroup.leaderPersonId, personId), inArray(workGroup.id, own)),
      ),
    )
    .orderBy(asc(workGroup.name));
  if (groups.length === 0) return [];
  const members = await exec
    .select({ groupId: workGroupMembership.groupId, personId: workGroupMembership.personId })
    .from(workGroupMembership)
    .where(
      and(
        inArray(
          workGroupMembership.groupId,
          groups.map((group) => group.id),
        ),
        isNull(workGroupMembership.leftAt),
      ),
    );
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    personIds: [
      ...new Set([
        ...members.filter((member) => member.groupId === group.id).map((member) => member.personId),
        ...(group.leaderPersonId ? [group.leaderPersonId] : []),
      ]),
    ],
  }));
}
