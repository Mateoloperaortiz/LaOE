import { and, eq, isNull, sql } from "drizzle-orm";
import type { Client } from "pg";
import { getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { splitFullName } from "@/modules/people";
import { committee, committeeMembership, membership, person } from "@/modules/people/schema";
import { importJob } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { dateKeyIn } from "@/shared/lib/dates";

// Migración en seco desde GHPOINTS (ADR-018, ADR-034, 08-migracion-ghpoints.md), subconjunto de la
// fase 2: términos, comités, personas, membresías, pertenencias por término y permisos. Lee del dump
// restaurado con `pg` (sesión de solo lectura) y escribe con Drizzle; idempotente por `legacyId`.

const TIME_ZONE = "America/Bogota";

interface LegacySeason {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  academicTerm: string;
}

interface LegacyCommittee {
  id: string;
  name: string;
  slug: string;
  status: string;
  color: string | null;
  presentation: string | null;
  contactUrl: string | null;
  publicationStatus: string;
}

interface LegacyMember {
  id: string;
  fullName: string;
  institutionalEmail: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyMemberCommittee {
  memberId: string;
  committeeId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

interface LegacyRole {
  memberId: string;
  role: string;
  committeeId: string | null;
}

export interface MigrationSummary {
  terms: number;
  committees: number;
  people: number;
  memberships: number;
  committeeMemberships: number;
  permissions: number;
  leaders: number;
  warnings: string[];
}

interface TermRef {
  id: string;
  code: string;
  startsOn: string;
  endsOn: string;
}

export function seasonCode(season: Pick<LegacySeason, "startDate" | "academicTerm">): string {
  const year = String(season.startDate).slice(0, 4);
  return `${year}-${season.academicTerm === "SECOND" ? 2 : 1}`;
}

function dayOf(date: Date): string {
  return dateKeyIn(TIME_ZONE, date);
}

function termContaining(terms: TermRef[], day: string): TermRef | undefined {
  return terms.find((item) => item.startsOn <= day && item.endsOn >= day);
}

function overlapping(terms: TermRef[], from: string, to: string): TermRef[] {
  return terms.filter((item) => item.startsOn <= to && item.endsOn >= from);
}

export async function readLegacy(source: Client) {
  // Un solo cliente `pg`: las lecturas van en serie.
  const seasons = await source.query<LegacySeason>(
    'select id, name, "startDate"::text as "startDate", "endDate"::text as "endDate", status, "academicTerm" from "Season" order by "startDate"',
  );
  const committees = await source.query<LegacyCommittee>(
    'select id, name, slug, status, color, presentation, "contactUrl", "publicationStatus" from "Committee" order by slug',
  );
  const members = await source.query<LegacyMember>(
    'select id, "fullName", "institutionalEmail", status, "createdAt", "updatedAt" from "Member" order by "createdAt"',
  );
  const memberCommittees = await source.query<LegacyMemberCommittee>(
    'select "memberId", "committeeId", "joinedAt", "leftAt" from "MemberCommittee" order by "joinedAt"',
  );
  const roles = await source.query<LegacyRole>(
    'select "memberId", role, "committeeId" from "MemberRole"',
  );
  return {
    seasons: seasons.rows,
    committees: committees.rows,
    members: members.rows,
    memberCommittees: memberCommittees.rows,
    roles: roles.rows,
  };
}

export async function migrateGhpoints(
  source: Client,
  options: { actorId: string | null; now?: Date } = { actorId: null },
): Promise<MigrationSummary> {
  const legacy = await readLegacy(source);
  const now = options.now ?? new Date();
  const summary: MigrationSummary = {
    terms: 0,
    committees: 0,
    people: 0,
    memberships: 0,
    committeeMemberships: 0,
    permissions: 0,
    leaders: 0,
    warnings: [],
  };
  const db = getDb();
  await db.transaction(async (tx) => {
    // 1. Términos: código derivado de la fecha de inicio y el semestre académico.
    for (const season of legacy.seasons) {
      const code = seasonCode(season);
      const [existing] = await tx.select({ id: term.id }).from(term).where(eq(term.code, code));
      if (!existing) {
        await tx.insert(term).values({
          code,
          semester: code.endsWith("-2") ? 2 : 1,
          startsOn: season.startDate,
          endsOn: season.endDate,
          pointsClosedAt:
            season.status === "CLOSED" ? new Date(`${season.endDate}T23:59:59Z`) : null,
        });
        summary.terms += 1;
      }
    }
    const terms: TermRef[] = (await tx.select().from(term)).map((row) => ({
      id: row.id,
      code: row.code,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
    }));
    const today = dayOf(now);
    const currentTerm = termContaining(terms, today);

    // 2. Comités: por sigla; se guarda legacyId y se completa lo que esté vacío.
    const committeeByLegacy = new Map<string, string>();
    for (const item of legacy.committees) {
      const [existing] = await tx
        .select({
          id: committee.id,
          presentation: committee.presentation,
          contactUrl: committee.contactUrl,
        })
        .from(committee)
        .where(eq(committee.slug, item.slug));
      if (existing) {
        await tx
          .update(committee)
          .set({
            legacyId: item.id,
            presentation: existing.presentation ?? item.presentation,
            contactUrl: existing.contactUrl ?? item.contactUrl,
          })
          .where(eq(committee.id, existing.id));
        committeeByLegacy.set(item.id, existing.id);
      } else {
        const [created] = await tx
          .insert(committee)
          .values({
            slug: item.slug,
            name: item.name,
            status: item.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
            color: item.color,
            logoKey: item.slug,
            presentation: item.presentation,
            contactUrl: item.contactUrl,
            publicationStatus: item.publicationStatus === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            legacyId: item.id,
          })
          .returning({ id: committee.id });
        if (created) {
          committeeByLegacy.set(item.id, created.id);
          summary.committees += 1;
        }
      }
    }

    // 3. Personas y membresías: idempotente por legacyId; si el roster ya creó el correo, se enlaza.
    const personByLegacy = new Map<string, string>();
    const earliestJoin = new Map<string, Date>();
    for (const item of legacy.memberCommittees) {
      const current = earliestJoin.get(item.memberId);
      if (!current || item.joinedAt < current) {
        earliestJoin.set(item.memberId, item.joinedAt);
      }
    }
    for (const member of legacy.members) {
      const email = member.institutionalEmail.trim().toLowerCase();
      const status =
        member.status === "ON_LEAVE" || member.status === "HONORARY" || member.status === "INACTIVE"
          ? member.status
          : "ACTIVE";
      let personId: string | undefined;
      const [byLegacy] = await tx
        .select({ id: person.id })
        .from(person)
        .where(eq(person.legacyId, member.id));
      if (byLegacy) {
        personId = byLegacy.id;
      } else {
        const [byEmail] = await tx
          .select({ id: person.id })
          .from(person)
          .where(eq(person.email, email));
        if (byEmail) {
          await tx.update(person).set({ legacyId: member.id }).where(eq(person.id, byEmail.id));
          personId = byEmail.id;
        } else {
          const names = splitFullName(member.fullName);
          const [created] = await tx
            .insert(person)
            .values({
              email,
              firstName: names.firstName,
              lastName: names.lastName,
              stage: status === "INACTIVE" ? "ALUMNI" : "MEMBER",
              source: "GHPOINTS",
              legacyId: member.id,
            })
            .returning({ id: person.id });
          if (!created) {
            throw new Error(`No se pudo crear la persona ${email}`);
          }
          personId = created.id;
          summary.people += 1;
        }
      }
      personByLegacy.set(member.id, personId);
      const [hasMembership] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(eq(membership.personId, personId));
      if (!hasMembership) {
        const evidence = earliestJoin.get(member.id) ?? member.createdAt;
        const firstTerm = termContaining(terms, dayOf(evidence)) ?? terms[0];
        if (!firstTerm) {
          summary.warnings.push(`Sin término para ${email}`);
          continue;
        }
        await tx.insert(membership).values({
          personId,
          status,
          firstTermId: firstTerm.id,
          ...(status === "INACTIVE"
            ? { endedAt: member.updatedAt, endReason: "OTHER" as const }
            : {}),
        });
        summary.memberships += 1;
      }
    }

    // 4. Pertenencias: una fila por cada término que solapa el rango de la pertenencia vieja.
    for (const item of legacy.memberCommittees) {
      const personId = personByLegacy.get(item.memberId);
      const committeeId = committeeByLegacy.get(item.committeeId);
      if (!personId || !committeeId) {
        continue;
      }
      const from = dayOf(item.joinedAt);
      const to = item.leftAt ? dayOf(item.leftAt) : today;
      for (const target of overlapping(terms, from, to)) {
        const inserted = await tx
          .insert(committeeMembership)
          .values({
            personId,
            committeeId,
            termId: target.id,
            roleCode: "MIEMBRO",
            joinedAt: from >= target.startsOn ? item.joinedAt : null,
            leftAt: item.leftAt && to <= target.endsOn ? item.leftAt : null,
          })
          .onConflictDoNothing()
          .returning({ id: committeeMembership.id });
        summary.committeeMemberships += inserted.length;
      }
    }

    // 5. Permisos: ADMIN y líder con comité; el líder también es General en el término actual.
    for (const role of legacy.roles) {
      const personId = personByLegacy.get(role.memberId);
      if (!personId) {
        continue;
      }
      if (role.role === "ADMIN") {
        const inserted = await tx
          .insert(permission)
          .values({ personId, code: "ADMIN", grantedById: options.actorId })
          .onConflictDoNothing()
          .returning({ id: permission.id });
        summary.permissions += inserted.length;
      } else if (role.role === "COMMITTEE_LEADER" && role.committeeId) {
        const committeeId = committeeByLegacy.get(role.committeeId);
        if (!committeeId) {
          continue;
        }
        const inserted = await tx
          .insert(permission)
          .values({ personId, code: "COMMITTEE_LEADER", committeeId, grantedById: options.actorId })
          .onConflictDoNothing()
          .returning({ id: permission.id });
        summary.permissions += inserted.length;
        if (currentTerm) {
          const [general] = await tx
            .select({ id: committeeMembership.id, personId: committeeMembership.personId })
            .from(committeeMembership)
            .where(
              and(
                eq(committeeMembership.committeeId, committeeId),
                eq(committeeMembership.termId, currentTerm.id),
                eq(committeeMembership.roleCode, "GENERAL"),
                isNull(committeeMembership.leftAt),
              ),
            );
          if (general && general.personId !== personId) {
            summary.warnings.push(
              `El comité ${role.committeeId} ya tiene un General en ${currentTerm.code}; ${personId} queda como Miembro`,
            );
            continue;
          }
          const updated = await tx
            .update(committeeMembership)
            .set({ roleCode: "GENERAL" })
            .where(
              and(
                eq(committeeMembership.personId, personId),
                eq(committeeMembership.committeeId, committeeId),
                eq(committeeMembership.termId, currentTerm.id),
                isNull(committeeMembership.leftAt),
                sql`${committeeMembership.roleCode} <> 'GENERAL'`,
              ),
            )
            .returning({ id: committeeMembership.id });
          summary.leaders += updated.length;
        }
      }
    }

    await tx.insert(importJob).values({
      type: "GHPOINTS",
      status: "APPLIED",
      filename: "ghpoints",
      createdById: options.actorId,
      appliedAt: now,
      summary: {
        ...summary,
        source: { members: legacy.members.length, committees: legacy.committees.length },
      },
    });
  });
  return summary;
}

export interface VerificationRow {
  name: string;
  source: number;
  target: number;
}

/** Conteos origen/destino de la fase 2; una diferencia es una fila con `source !== target`. */
export async function verifyMigration(source: Client): Promise<VerificationRow[]> {
  const legacy = await readLegacy(source);
  const db = getDb();
  const count = async (query: ReturnType<typeof sql>) => {
    const result = await db.execute<{ n: string }>(query);
    return Number.parseInt(result.rows[0]?.n ?? "0", 10);
  };
  const seasonCodes = new Set(legacy.seasons.map(seasonCode));
  const pairs = new Set(
    legacy.memberCommittees.map((item) => `${item.memberId}:${item.committeeId}`),
  );
  return [
    {
      name: "Season → term",
      source: seasonCodes.size,
      target: await count(
        sql`select count(*)::text as n from term where code in (${sql.join(
          [...seasonCodes].map((code) => sql`${code}`),
          sql`, `,
        )})`,
      ),
    },
    {
      name: "Committee → committee (legacyId)",
      source: legacy.committees.length,
      target: await count(
        sql`select count(*)::text as n from committee where legacy_id is not null`,
      ),
    },
    {
      name: "Member → person (legacyId)",
      source: legacy.members.length,
      target: await count(sql`select count(*)::text as n from person where legacy_id is not null`),
    },
    {
      name: "Member → membership",
      source: legacy.members.length,
      target: await count(
        sql`select count(*)::text as n from membership m join person p on p.id = m.person_id where p.legacy_id is not null`,
      ),
    },
    {
      name: "MemberCommittee (pares) → committee_membership (pares)",
      source: pairs.size,
      target: await count(
        sql`select count(distinct (cm.person_id, cm.committee_id))::text as n from committee_membership cm join person p on p.id = cm.person_id join committee c on c.id = cm.committee_id where p.legacy_id is not null and c.legacy_id is not null`,
      ),
    },
    {
      name: "MemberRole → permission",
      source: legacy.roles.filter((role) => role.role !== "MEMBER").length,
      target: await count(
        sql`select count(*)::text as n from permission pe join person p on p.id = pe.person_id where p.legacy_id is not null`,
      ),
    },
  ];
}
