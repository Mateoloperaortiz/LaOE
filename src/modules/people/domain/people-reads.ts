import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { membership, person } from "../schema";

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
