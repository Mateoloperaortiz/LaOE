import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appointment, committeeMembership, membership, membershipTerm, person } from "../schema";

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

/** Cualquier persona por correo normalizado (prospectos incluidos); para vincular respuestas de formularios. */
export async function findPersonByEmail(
  email: string,
): Promise<(PersonRef & { stage: string; kind: string }) | null> {
  const [row] = await getDb()
    .select({
      id: person.id,
      fullName: person.fullName,
      email: person.email,
      stage: person.stage,
      kind: person.kind,
    })
    .from(person)
    .where(eq(person.email, email))
    .limit(1);
  return row ? { ...row, fullName: row.fullName ?? "" } : null;
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

export interface ActiveMemberRef {
  personId: string;
  fullName: string;
  preferredName: string | null;
  firstTermId: string;
  anonymized: boolean;
}

/**
 * Miembros activos con su primer término: nuevos y veteranos de los tableros (ADR-008). Con
 * `includeHonorary`, también los honorarios: la audiencia de los push (ADR-038 regla 6).
 */
export async function listActiveMemberRefs(includeHonorary = false): Promise<ActiveMemberRef[]> {
  const rows = await getDb()
    .select({
      personId: person.id,
      fullName: person.fullName,
      preferredName: person.preferredName,
      firstTermId: membership.firstTermId,
      anonymizedAt: person.anonymizedAt,
    })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(
      includeHonorary
        ? inArray(membership.status, ["ACTIVE", "HONORARY"])
        : eq(membership.status, "ACTIVE"),
    );
  return rows.map((row) => ({
    personId: row.personId,
    fullName: row.fullName ?? "",
    preferredName: row.preferredName,
    firstTermId: row.firstTermId,
    anonymized: row.anonymizedAt !== null,
  }));
}

// Lecturas para permanencia (ADR-036): el roster del término con la condición de cada persona.

export interface TermRosterRow {
  personId: string;
  status: (typeof membership.$inferSelect)["status"];
  firstTermId: string;
  probation: boolean;
  committeeId: string;
  roleCode: string;
  transferredIn: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
}

async function rosterRows(termId: string, personIds?: string[]): Promise<TermRosterRow[]> {
  if (personIds && personIds.length === 0) {
    return [];
  }
  const rows = await getDb()
    .select({
      personId: committeeMembership.personId,
      status: membership.status,
      firstTermId: membership.firstTermId,
      probation: membershipTerm.probation,
      committeeId: committeeMembership.committeeId,
      roleCode: committeeMembership.roleCode,
      transferredIn: committeeMembership.transferredIn,
      joinedAt: committeeMembership.joinedAt,
      leftAt: committeeMembership.leftAt,
    })
    .from(committeeMembership)
    .innerJoin(membership, eq(membership.personId, committeeMembership.personId))
    .leftJoin(
      membershipTerm,
      and(
        eq(membershipTerm.personId, committeeMembership.personId),
        eq(membershipTerm.termId, committeeMembership.termId),
      ),
    )
    .where(
      and(
        eq(committeeMembership.termId, termId),
        personIds ? inArray(committeeMembership.personId, personIds) : undefined,
      ),
    );
  return rows.map((row) => ({ ...row, probation: row.probation ?? false }));
}

/** Una fila por pertenencia del término, con estado, primer término y condición de prueba; opcionalmente solo algunas personas. */
export function listTermRoster(termId: string, personIds?: string[]): Promise<TermRosterRow[]> {
  return rosterRows(termId, personIds);
}

export interface MemberByEmail {
  id: string;
  fullName: string;
  status: (typeof membership.$inferSelect)["status"];
}

/** Miembros por correo institucional (en minúsculas), para importar grupos desde un CSV. */
export async function findMembersByEmails(emails: string[]): Promise<Map<string, MemberByEmail>> {
  const wanted = [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter(Boolean);
  if (wanted.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({
      id: person.id,
      email: person.email,
      fullName: person.fullName,
      status: membership.status,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(inArray(person.email, wanted));
  return new Map(
    rows.map((row) => [
      row.email,
      { id: row.id, fullName: row.fullName ?? "", status: row.status },
    ]),
  );
}

export interface TermAppointment {
  personId: string;
  kind: (typeof appointment.$inferSelect)["kind"];
  committeeId: string | null;
  title: string | null;
}

/** Cargos de junta y de GH del término: lideran los comités de trabajo y evalúan grupos. */
export async function listAppointmentsForTerm(termId: string): Promise<TermAppointment[]> {
  return getDb()
    .select({
      personId: appointment.personId,
      kind: appointment.kind,
      committeeId: appointment.committeeId,
      title: appointment.title,
    })
    .from(appointment)
    .where(eq(appointment.termId, termId));
}

export interface MembershipStatusRef {
  fullName: string;
  status: (typeof membership.$inferSelect)["status"];
}

/** Nombre y estado de membresía de varias personas (para las altas en grupos de trabajo). */
export async function listMembershipStatuses(
  personIds: string[],
): Promise<Map<string, MembershipStatusRef>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({ id: person.id, fullName: person.fullName, status: membership.status })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(inArray(person.id, ids));
  return new Map(rows.map((row) => [row.id, { fullName: row.fullName ?? "", status: row.status }]));
}

// Lecturas para comunicaciones (ADR-038 regla 8): a quién y a qué correo escribirle.

export interface MailingRef {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string;
  personalEmail: string | null;
  stage: (typeof person.$inferSelect)["stage"];
  /** Nulo cuando la persona nunca tuvo membresía (prospectos, postulantes, contactos externos). */
  membershipStatus: (typeof membership.$inferSelect)["status"] | null;
  anonymized: boolean;
}

/** Datos de contacto y estado de varias personas, para renderizar y dirigir una campaña. */
export async function listMailingRefs(personIds: string[]): Promise<Map<string, MailingRef>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      preferredName: person.preferredName,
      email: person.email,
      personalEmail: person.personalEmail,
      stage: person.stage,
      membershipStatus: membership.status,
      anonymizedAt: person.anonymizedAt,
    })
    .from(person)
    .leftJoin(membership, eq(membership.personId, person.id))
    .where(inArray(person.id, ids));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        preferredName: row.preferredName,
        email: row.email,
        personalEmail: row.personalEmail,
        stage: row.stage,
        membershipStatus: row.membershipStatus ?? null,
        anonymized: row.anonymizedAt !== null,
      },
    ]),
  );
}
