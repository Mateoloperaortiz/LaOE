import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { membership, person } from "../schema";

// Lecturas explícitas que otros módulos pueden usar (ADR-001).

export type MembershipStatus = (typeof membership.$inferSelect)["status"];

/** Solo activos y honorarios entran a Mi OE (05-acceso.md). */
export const SIGN_IN_STATUSES: readonly MembershipStatus[] = ["ACTIVE", "HONORARY"];

export interface MemberSummary {
  personId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  membershipStatus: MembershipStatus;
  canSignIn: boolean;
}

const summaryColumns = {
  personId: person.id,
  email: person.email,
  firstName: person.firstName,
  lastName: person.lastName,
  preferredName: person.preferredName,
  membershipStatus: membership.status,
};

function withSignIn(row: Omit<MemberSummary, "canSignIn">): MemberSummary {
  return { ...row, canSignIn: SIGN_IN_STATUSES.includes(row.membershipStatus) };
}

/** Persona del roster que puede entrar, por su correo institucional en minúsculas. */
export async function findEligibleMemberByEmail(email: string): Promise<MemberSummary | null> {
  const [row] = await getDb()
    .select(summaryColumns)
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(and(eq(person.email, email), inArray(membership.status, [...SIGN_IN_STATUSES])))
    .limit(1);
  return row ? withSignIn(row) : null;
}

export async function getMemberSummary(personId: string): Promise<MemberSummary | null> {
  const [row] = await getDb()
    .select(summaryColumns)
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.id, personId))
    .limit(1);
  return row ? withSignIn(row) : null;
}
