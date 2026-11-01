import type { Actor, Executor } from "@/db/tx";
import { listAvailabilityCommittees, listAvailabilityPeople } from "@/modules/people";
import { listAvailabilityWorkGroups } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import type { AvailabilityGroup } from "../types";

export async function availabilityContext(exec: Executor, actor: Actor) {
  if (!actor.personId) throw new DomainError(t("T-4609"));
  const [member] = await listAvailabilityPeople(exec, [actor.personId]);
  if (!member) throw new DomainError(t("T-4609"));
  const term = await getCurrentTerm(new Date(), exec);
  return { member, term };
}

export async function availabilityGroups(
  exec: Executor,
  personId: string,
  termId: string,
): Promise<Array<AvailabilityGroup & { personIds: string[] }>> {
  const committees = await listAvailabilityCommittees(exec, personId, termId);
  const workGroups = await listAvailabilityWorkGroups(exec, personId, termId);
  return [
    ...committees.map((group) => ({ ...group, type: "COMMITTEE" as const })),
    ...workGroups.map((group) => ({ ...group, type: "WORK_GROUP" as const })),
  ];
}

export function requireAvailabilityGroup<T extends AvailabilityGroup>(
  groups: T[],
  scope: Pick<AvailabilityGroup, "type" | "id">,
) {
  const group = groups.find((group) => group.type === scope.type && group.id === scope.id);
  if (!group) throw new DomainError(t("T-4609"));
  return group;
}
