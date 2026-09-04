import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { committeeMembership, membership, person } from "../schema";

// Lecturas de personas para otros módulos y para la paleta.

export interface PersonRef {
  id: string;
  fullName: string;
  email: string;
}

export async function getPeopleByIds(ids: string[]): Promise<Map<string, PersonRef>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({ id: person.id, fullName: person.fullName, email: person.email })
    .from(person)
    .where(inArray(person.id, ids));
  return new Map(
    rows.map((row) => [row.id, { id: row.id, fullName: row.fullName ?? "", email: row.email }]),
  );
}

/** Persona con membresía (cualquier estado) por correo; para otorgar permisos. */
export async function findMemberByEmail(email: string): Promise<PersonRef | null> {
  const [row] = await getDb()
    .select({ id: person.id, fullName: person.fullName, email: person.email })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.email, email))
    .limit(1);
  return row ? { id: row.id, fullName: row.fullName ?? "", email: row.email } : null;
}

/** Búsqueda por similitud (pg_trgm) sobre nombre y correo, para la paleta ⌘K y los listados. */
export async function searchPeople(q: string, limit = 8): Promise<PersonRef[]> {
  const pattern = `%${q}%`;
  const rows = await getDb()
    .select({ id: person.id, fullName: person.fullName, email: person.email })
    .from(person)
    .where(
      or(
        sql`similarity(${person.fullName}, ${q}) > 0.2`,
        ilike(person.fullName, pattern),
        ilike(person.email, pattern),
      ),
    )
    .orderBy(
      sql`greatest(similarity(${person.fullName}, ${q}), similarity(${person.email}, ${q})) desc`,
    )
    .limit(limit);
  return rows.map((row) => ({ id: row.id, fullName: row.fullName ?? "", email: row.email }));
}

// Lecturas para participación (ADR-035): se resuelven fuera de la transacción del check-in.

export interface MembershipRef {
  status: (typeof membership.$inferSelect)["status"];
  firstTermId: string;
}

/** Estado y primer término de la membresía; null si la persona no tiene membresía. */
export async function getMembershipRef(personId: string): Promise<MembershipRef | null> {
  const [row] = await getDb()
    .select({ status: membership.status, firstTermId: membership.firstTermId })
    .from(membership)
    .where(eq(membership.personId, personId))
    .limit(1);
  return row ?? null;
}

export interface TermCommitteeMember {
  personId: string;
  committeeId: string;
  status: (typeof membership.$inferSelect)["status"];
  joinedAt: Date | null;
  leftAt: Date | null;
}

/** Pertenencias de un término con el estado de la membresía: los elegibles del score de comité (ADR-005, ADR-009). */
export async function listTermCommitteeMembers(termId: string): Promise<TermCommitteeMember[]> {
  return getDb()
    .select({
      personId: committeeMembership.personId,
      committeeId: committeeMembership.committeeId,
      status: membership.status,
      joinedAt: committeeMembership.joinedAt,
      leftAt: committeeMembership.leftAt,
    })
    .from(committeeMembership)
    .innerJoin(membership, eq(membership.personId, committeeMembership.personId))
    .where(eq(committeeMembership.termId, termId));
}

export interface MemberRef {
  id: string;
  fullName: string;
  preferredName: string | null;
  status: (typeof membership.$inferSelect)["status"];
}

/** Búsqueda por nombre sin correo, para el anfitrión y la alta manual (los líderes no ven correos). */
export async function searchMembersByName(q: string, limit = 8): Promise<MemberRef[]> {
  const pattern = `%${q}%`;
  const rows = await getDb()
    .select({
      id: person.id,
      fullName: person.fullName,
      preferredName: person.preferredName,
      status: membership.status,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(or(sql`similarity(${person.fullName}, ${q}) > 0.2`, ilike(person.fullName, pattern)))
    .orderBy(sql`similarity(${person.fullName}, ${q}) desc`)
    .limit(limit);
  return rows.map((row) => ({ ...row, fullName: row.fullName ?? "" }));
}
