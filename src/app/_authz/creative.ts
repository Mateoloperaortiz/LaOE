import "server-only";
import { cache } from "react";
import type { Actor } from "@/modules/identity";
import { listCommitteeIdsForPersonInTerm } from "@/modules/people";
import { adminAreaRoles } from "./admin-area";

export const creativeAccess = cache(async (actor: Actor) => {
  const roles = await adminAreaRoles(actor);
  return {
    ...(actor.access === "MEMBER" ? { personId: actor.personId } : {}),
    all: roles.isAdmin || roles.boardSeats.some((item) => item.seat === "VP_COMMUNICATIONS"),
    committees: roles.committees
      .filter((row) => row.capabilities.includes("BOARD"))
      .map((row) => row.committee.id),
    readableCommittees:
      actor.access === "MEMBER" && roles.currentTermId
        ? await listCommitteeIdsForPersonInTerm(actor.personId, roles.currentTermId)
        : [],
  };
});

export async function canReadCreativeBoard(actor: Actor, committeeId: string) {
  const access = await creativeAccess(actor);
  return (
    access.all ||
    access.committees.includes(committeeId) ||
    access.readableCommittees.includes(committeeId)
  );
}
