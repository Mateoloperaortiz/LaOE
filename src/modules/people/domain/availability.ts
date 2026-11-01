import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Executor } from "@/db/tx";
import { committee, committeeMembership, membership, person } from "../schema";
import { liveConsentExists } from "./consents";
import { listCommitteeIdsForPersonInTerm } from "./people-reads";
import { SIGN_IN_STATUSES } from "./reads";

/** Proyección mínima para disponibilidad: nunca entrega correo, foto ni datos de contacto. */
export async function listAvailabilityPeople(exec: Executor, personIds: string[]) {
  if (personIds.length === 0) return [];
  return exec
    .select({ personId: person.id, name: person.fullName, status: membership.status })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        inArray(person.id, personIds),
        inArray(membership.status, [...SIGN_IN_STATUSES]),
        isNull(person.anonymizedAt),
        liveConsentExists("MEMBERSHIP"),
      ),
    )
    .orderBy(asc(person.fullName), asc(person.id));
}

/** Pertenencias vivas del actor; conserva comités privados y especiales del mismo padrón. */
export async function listAvailabilityCommittees(exec: Executor, personId: string, termId: string) {
  const ids = await listCommitteeIdsForPersonInTerm(personId, termId, exec);
  if (ids.length === 0) return [];
  const rows = await exec
    .select({ id: committee.id, name: committee.name, personId: committeeMembership.personId })
    .from(committee)
    .innerJoin(committeeMembership, eq(committeeMembership.committeeId, committee.id))
    .where(
      and(
        inArray(committee.id, ids),
        inArray(committee.status, ["ACTIVE", "ON_TRIAL"]),
        eq(committeeMembership.termId, termId),
        isNull(committeeMembership.leftAt),
      ),
    )
    .orderBy(asc(committee.name));
  return [...new Set(rows.map((row) => row.id))].map((id) => ({
    id,
    name: rows.find((row) => row.id === id)?.name ?? "",
    personIds: rows.filter((row) => row.id === id).map((row) => row.personId),
  }));
}
