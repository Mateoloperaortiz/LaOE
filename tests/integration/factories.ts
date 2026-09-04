import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { committee, committeeMembership, membership, person } from "@/modules/people/schema";
import { conventionalTermDates } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { todayKey } from "@/shared/lib/dates";

// Fábricas de datos sintéticos para las pruebas de integración: nunca datos reales.

const db = () => getDb();

/** El código del término que contiene hoy en Bogotá, con fechas por semestre calendario. */
export function currentTermCode(): string {
  const today = todayKey();
  const year = today.slice(0, 4);
  const month = Number.parseInt(today.slice(5, 7), 10);
  return `${year}-${month <= 6 ? 1 : 2}`;
}

export async function seedTerm(code = currentTermCode()): Promise<string> {
  const [existing] = await db().select({ id: term.id }).from(term).where(eq(term.code, code));
  if (existing) {
    return existing.id;
  }
  const dates = conventionalTermDates(code);
  const [row] = await db()
    .insert(term)
    .values({ code, semester: code.endsWith("-2") ? 2 : 1, ...dates })
    .returning({ id: term.id });
  if (!row) throw new Error("seed term");
  return row.id;
}

type PersonOverrides = Partial<{
  firstName: string;
  lastName: string;
  stage: "PROSPECT" | "APPLICANT" | "MEMBER" | "ALUMNI";
  kind: "STUDENT" | "EXTERNAL";
  phone: string | null;
  program: string | null;
  personalEmail: string | null;
}>;

export async function seedPerson(email: string, overrides: PersonOverrides = {}): Promise<string> {
  const [row] = await db()
    .insert(person)
    .values({
      email,
      firstName: overrides.firstName ?? "Persona",
      lastName: overrides.lastName ?? "Sintética",
      stage: overrides.stage ?? "MEMBER",
      kind: overrides.kind ?? "STUDENT",
      phone: overrides.phone ?? null,
      program: overrides.program ?? null,
      personalEmail: overrides.personalEmail ?? null,
      source: "TEST",
    })
    .returning({ id: person.id });
  if (!row) throw new Error("seed person");
  return row.id;
}

export async function seedMembership(
  personId: string,
  termId: string,
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE" = "ACTIVE",
): Promise<string> {
  const [row] = await db()
    .insert(membership)
    .values({
      personId,
      firstTermId: termId,
      status,
      ...(status === "INACTIVE" ? { endedAt: new Date(), endReason: "OTHER" as const } : {}),
    })
    .returning({ id: membership.id });
  if (!row) throw new Error("seed membership");
  return row.id;
}

/** Persona del roster con membresía activa en el término actual; devuelve su id. */
export async function seedMember(email: string, overrides: PersonOverrides = {}): Promise<string> {
  const termId = await seedTerm();
  const personId = await seedPerson(email, overrides);
  await seedMembership(personId, termId);
  return personId;
}

export async function seedCommittee(slug: string, name = slug.toUpperCase()): Promise<string> {
  const [row] = await db()
    .insert(committee)
    .values({ slug, name, status: "ACTIVE", publicationStatus: "PUBLISHED" })
    .returning({ id: committee.id });
  if (!row) throw new Error("seed committee");
  return row.id;
}

export async function seedCommitteeMembership(
  personId: string,
  committeeId: string,
  termId: string,
  roleCode = "MIEMBRO",
): Promise<string> {
  const [row] = await db()
    .insert(committeeMembership)
    .values({ personId, committeeId, termId, roleCode, joinedAt: new Date() })
    .returning({ id: committeeMembership.id });
  if (!row) throw new Error("seed committee membership");
  return row.id;
}

type OccasionOverrides = Partial<{
  title: string;
  kind: "ACTIVITY" | "ASSEMBLY" | "EDITION_SESSION";
  assemblyKind: "ORDINARY" | "BOARD_ELECTION" | "RUNOFF" | null;
  category:
    | "INTEGRATION"
    | "ATHLETIC_MATCH"
    | "COMMITTEE_MEETING"
    | "TALK"
    | "WORKSHOP"
    | "SOCIAL"
    | "OTHER";
  newMembersOnly: boolean;
  points: number;
  approval: "AUTO" | "MANUAL";
  status: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
  requireRotatingCode: boolean;
  rotatingSecret: string | null;
  committeeId: string | null;
  startsAt: Date;
  checkInOpensAt: Date;
  checkInClosesAt: Date;
  publicId: string;
}>;

let occasionCounter = 0;

/** Ocasión abierta ahora mismo, con 10 puntos y aprobación automática salvo que se diga otra cosa. */
export async function seedOccasion(
  termId: string,
  overrides: OccasionOverrides = {},
): Promise<{ id: string; publicId: string }> {
  occasionCounter += 1;
  const now = Date.now();
  const [row] = await db()
    .insert(occasion)
    .values({
      termId,
      publicId:
        overrides.publicId ??
        `t${String(occasionCounter).padStart(4, "0")}${String(now % 100_000).padStart(5, "0")}`,
      title: overrides.title ?? `Ocasión de prueba ${occasionCounter}`,
      kind: overrides.kind ?? "ACTIVITY",
      assemblyKind: overrides.assemblyKind ?? null,
      category: overrides.category ?? "OTHER",
      newMembersOnly: overrides.newMembersOnly ?? false,
      points: overrides.points ?? 10,
      approval: overrides.approval ?? "AUTO",
      status: overrides.status ?? "OPEN",
      requireRotatingCode: overrides.requireRotatingCode ?? false,
      rotatingSecret: overrides.rotatingSecret ?? null,
      committeeId: overrides.committeeId ?? null,
      startsAt: overrides.startsAt ?? new Date(now),
      checkInOpensAt: overrides.checkInOpensAt ?? new Date(now - 3_600_000),
      checkInClosesAt: overrides.checkInClosesAt ?? new Date(now + 3_600_000),
    })
    .returning({ id: occasion.id, publicId: occasion.publicId });
  if (!row) throw new Error("seed occasion");
  return row;
}
