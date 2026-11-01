import type { AvailabilityComparison } from "../types";

export function compareAvailability(
  people: Array<{ personId: string; name: string | null }>,
  responses: Array<{ personId: string; slots: number[] }>,
  slotCount: number,
): AvailabilityComparison {
  const byPerson = new Map(responses.map((response) => [response.personId, response.slots]));
  const members = people.map((member) => ({
    personId: member.personId,
    name: member.name ?? "",
    slots: byPerson.get(member.personId) ?? null,
  }));
  const counts = Array<number>(slotCount).fill(0);
  for (const member of members) {
    for (const slot of new Set(member.slots ?? [])) {
      if (slot >= 0 && slot < slotCount) counts[slot] = (counts[slot] ?? 0) + 1;
    }
  }
  return {
    total: members.length,
    answered: members.filter((member) => member.slots !== null).length,
    counts,
    members,
  };
}
