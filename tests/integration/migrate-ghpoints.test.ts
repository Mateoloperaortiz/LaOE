import { count, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { term } from "@/modules/participation/schema";
import { getPerson360 } from "@/modules/people/domain/person-360";
import { committee, committeeMembership, membership, person } from "@/modules/people/schema";
import { migrateGhpoints, seasonCode, verifyMigration } from "../../scripts/lib/migrate-ghpoints";
import { truncateAll } from "./db";
import { seedCommittee, seedTerm } from "./factories";

// Un esquema `legacy` mínimo con las tablas de GHPOINTS que usa la fase 2, dentro de la base de prueba.

const LEGACY_SQL = `
  drop schema if exists legacy cascade;
  create schema legacy;
  create table legacy."Season" (id text primary key, name text, "startDate" date, "endDate" date, status text, "academicTerm" text);
  create table legacy."Committee" (id text primary key, name text, slug text, status text, color text, presentation text, "contactUrl" text, "publicationStatus" text);
  create table legacy."Member" (id text primary key, "fullName" text, "institutionalEmail" text, "memberType" text, status text, "createdAt" timestamptz, "updatedAt" timestamptz);
  create table legacy."MemberCommittee" (id text primary key, "memberId" text, "committeeId" text, "joinedAt" timestamptz, "leftAt" timestamptz, "isActive" boolean);
  create table legacy."MemberRole" (id text primary key, "memberId" text, role text, "committeeId" text);
  insert into legacy."Season" values
    ('s1', '2026-1', '2026-01-19', '2026-06-06', 'CLOSED', 'FIRST'),
    ('s2', '2026-2', '2026-07-13', '2026-12-05', 'ACTIVE', 'SECOND');
  insert into legacy."Committee" values
    ('c1', 'A3 legado', 'a3', 'ACTIVE', '#1e3a5f', 'Presentación vieja', 'https://instagram.com/a3', 'PUBLISHED'),
    ('c2', 'Comité Nuevo', 'nuevo', 'ACTIVE', '#1e3a5f', null, null, 'DRAFT');
  insert into legacy."Member" values
    ('m1', 'Ada Admin Uno', 'ADA@eafit.edu.co', 'ACTIVE', 'ACTIVE', '2026-01-10T05:00:00Z', '2026-01-10T05:00:00Z'),
    ('m2', 'Bruno Betancur', 'bruno@eafit.edu.co', 'ACTIVE', 'INACTIVE', '2026-01-10T05:00:00Z', '2026-05-20T05:00:00Z'),
    ('m3', 'Camila Cadavid Duque Echeverri', 'camila@eafit.edu.co', 'NEW', 'ACTIVE', '2026-07-20T05:00:00Z', '2026-07-20T05:00:00Z');
  insert into legacy."MemberCommittee" values
    ('mc1', 'm1', 'c1', '2026-02-01T05:00:00Z', null, true),
    ('mc2', 'm2', 'c1', '2026-02-01T05:00:00Z', '2026-05-01T05:00:00Z', false),
    ('mc3', 'm3', 'c2', '2026-08-01T05:00:00Z', null, true);
  insert into legacy."MemberRole" values
    ('r1', 'm1', 'ADMIN', null),
    ('r2', 'm3', 'COMMITTEE_LEADER', 'c2'),
    ('r3', 'm2', 'MEMBER', null);
`;

async function legacyClient(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("set search_path to legacy, public");
  return client;
}

describe("migración en seco desde GHPOINTS", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("deriva términos, empareja comités por sigla, crea personas y permisos, y es idempotente", async () => {
    expect(seasonCode({ startDate: "2025-07-14", academicTerm: "SECOND" })).toBe("2025-2");
    await seedTerm();
    await seedCommittee("a3");
    await getDb().execute(LEGACY_SQL);
    const source = await legacyClient();
    try {
      const first = await migrateGhpoints(source, { actorId: null });
      expect(first).toMatchObject({
        terms: 1,
        committees: 1,
        people: 3,
        memberships: 3,
        committeeMemberships: 4,
        permissions: 2,
        leaders: 1,
      });
      const [closed] = await getDb().select().from(term).where(eq(term.code, "2026-1"));
      expect(closed?.pointsClosedAt).not.toBeNull();
      const [a3] = await getDb().select().from(committee).where(eq(committee.slug, "a3"));
      expect(a3).toMatchObject({ legacyId: "c1", presentation: "Presentación vieja" });
      const [ada] = await getDb().select().from(person).where(eq(person.legacyId, "m1"));
      expect(ada).toMatchObject({
        email: "ada@eafit.edu.co",
        firstName: "Ada",
        lastName: "Admin Uno",
        source: "GHPOINTS",
      });
      const [camila] = await getDb().select().from(person).where(eq(person.legacyId, "m3"));
      expect(camila).toMatchObject({ firstName: "Camila Cadavid", lastName: "Duque Echeverri" });
      const data = await getPerson360(camila?.id ?? "");
      expect(data?.membership?.firstTermCode).toBe("2026-2");
      expect(data?.committeesByTerm[0]?.items[0]).toMatchObject({
        committeeSlug: "nuevo",
        roleCode: "GENERAL",
      });
      const [bruno] = await getDb().select().from(person).where(eq(person.legacyId, "m2"));
      const [brunoMembership] = await getDb()
        .select()
        .from(membership)
        .where(eq(membership.personId, bruno?.id ?? ""));
      expect(bruno?.stage).toBe("ALUMNI");
      expect(brunoMembership).toMatchObject({ status: "INACTIVE", endReason: "OTHER" });
      const [adaTerms] = await getDb()
        .select({ n: count() })
        .from(committeeMembership)
        .where(eq(committeeMembership.personId, ada?.id ?? ""));
      expect(adaTerms?.n).toBe(2);
      const permissions = await getDb().select().from(permission);
      expect(permissions.map((row) => row.code).sort()).toEqual(["ADMIN", "COMMITTEE_LEADER"]);

      const second = await migrateGhpoints(source, { actorId: null });
      expect(second).toMatchObject({
        terms: 0,
        committees: 0,
        people: 0,
        memberships: 0,
        committeeMemberships: 0,
        permissions: 0,
        leaders: 0,
      });
      const rows = await verifyMigration(source);
      expect(rows.filter((row) => row.source !== row.target)).toEqual([]);
    } finally {
      await source.end();
    }
  });
});
