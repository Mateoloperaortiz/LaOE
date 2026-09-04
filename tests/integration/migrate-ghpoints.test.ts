import { and, count, eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { drain } from "@/jobs/poller";
import { permission } from "@/modules/identity/schema";
import { balanceFor, getTermStanding } from "@/modules/participation";
import {
  assemblyRequirement,
  checkIn,
  committeeParticipation,
  occasion,
  pointEntry,
} from "@/modules/participation/schema";
import { getPerson360 } from "@/modules/people/domain/person-360";
import { committee, committeeMembership, membership, person } from "@/modules/people/schema";
import { resolveAlias } from "@/modules/system";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { migrateGhpoints, seasonCode, verifyMigration } from "../../scripts/lib/migrate-ghpoints";
import {
  mapActivityCategory,
  mapCheckInSource,
  mapEntryKind,
  mapOccasionStatus,
} from "../../scripts/lib/migrate-participation";
import { truncateAll } from "./db";
import { seedCommittee, seedTerm } from "./factories";
import "@/jobs/handlers";

// Un esquema `legacy` mínimo con las tablas de GHPOINTS que usan las fases 2 y 3, dentro de la base de
// prueba. Los datos son sintéticos: cubren cada rama del mapeo (08-migracion-ghpoints.md).

const LEGACY_SQL = `
  drop schema if exists legacy cascade;
  create schema legacy;
  create table legacy."Season" (id text primary key, name text, "startDate" date, "endDate" date, status text, "academicTerm" text);
  create table legacy."Committee" (id text primary key, name text, slug text, status text, color text, presentation text, "contactUrl" text, "publicationStatus" text);
  create table legacy."Member" (id text primary key, "fullName" text, "institutionalEmail" text, "memberType" text, status text, "createdAt" timestamptz, "updatedAt" timestamptz);
  create table legacy."MemberCommittee" (id text primary key, "memberId" text, "committeeId" text, "joinedAt" timestamptz, "leftAt" timestamptz, "isActive" boolean);
  create table legacy."MemberRole" (id text primary key, "memberId" text, role text, "committeeId" text);
  create table legacy."Activity" (id text primary key, "publicId" text, "seasonId" text, name text, description text, "activityType" text, "startsAt" timestamptz, "registrationStart" timestamptz, "registrationEnd" timestamptz, "individualPoints" int, "approvalMode" text, status text, "committeeId" text, "eventEditionId" text, "cancelReason" text, "createdById" text, "createdAt" timestamptz);
  create table legacy."ActivityPublicIdHistory" (id text primary key, "activityId" text, "publicId" text, "retiredAt" timestamptz);
  create table legacy."Assembly" (id text primary key, "publicId" text, "seasonId" text, name text, description text, location text, kind text, "startsAt" timestamptz, "registrationStart" timestamptz, "registrationEnd" timestamptz, status text, "cancelReason" text, "createdById" text, "createdAt" timestamptz);
  create table legacy."AssemblyPublicIdHistory" (id text primary key, "assemblyId" text, "publicId" text, "retiredAt" timestamptz);
  create table legacy."Attendance" (id text primary key, "activityId" text, "memberId" text, status text, "registeredAt" timestamptz, "approvedAt" timestamptz, "approvedById" text, source text, "cancelledAt" timestamptz, "cancelReason" text, "updatedAt" timestamptz);
  create table legacy."AssemblyAttendance" (id text primary key, "assemblyId" text, "memberId" text, status text, "registeredAt" timestamptz, source text, "cancelledAt" timestamptz, "cancelReason" text, "cancelledById" text);
  create table legacy."PointTransaction" (id text primary key, "memberId" text, "seasonId" text, "attendanceId" text, points int, type text, reason text, "createdById" text, "createdAt" timestamptz, "reversalOfId" text);
  create table legacy."AssemblyRequirement" (id text primary key, "seasonId" text, "memberId" text, "requiredAttendanceCount" int, "requiresBoardElection" boolean, "adjustmentReason" text, "adjustedById" text);
  create table legacy."HallOfFameSeason" (id text primary key, "seasonId" text, "activeWinnerId" text, "newWinnerId" text, "committeeWinnerId" text, "top3Active" jsonb, "top3New" jsonb, "top3Committees" jsonb, stats jsonb, "createdAt" timestamptz);
  create table legacy."CommitteeActivityScore" (id text primary key, "committeeId" text, "activityId" text, "eligibleMemberCount" int, "participationRate" numeric, frozen boolean);
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
  insert into legacy."Activity" values
    ('a1', 'act0000001', 's2', 'Partido de fútbol', 'Partido', 'SPORTS', '2026-08-20T18:00:00Z', '2026-08-20T15:00:00Z', '2026-08-20T21:00:00Z', 20, 'AUTO', 'PROCESSED', 'c1', null, null, 'm1', '2026-08-10T05:00:00Z'),
    ('a2', 'act0000002', 's2', 'Charla con edición', null, 'GENERAL', '2026-08-26T18:00:00Z', '2026-08-25T03:00:00Z', '2026-09-02T03:00:00Z', 10, 'MANUAL', 'OPEN', null, 'ed1', null, 'm1', '2026-08-11T05:00:00Z'),
    ('a3', 'act0000003', 's1', 'Charla del semestre pasado', null, 'TALK', '2026-03-10T18:00:00Z', '2026-03-10T15:00:00Z', '2026-03-10T21:00:00Z', 15, 'AUTO', 'OPEN', 'c1', null, null, 'm1', '2026-03-01T05:00:00Z'),
    ('a4', 'act0000004', 's2', 'Cancelada', null, 'SOCIAL', '2026-08-28T18:00:00Z', '2026-08-28T15:00:00Z', '2026-08-28T21:00:00Z', 30, 'AUTO', 'CANCELLED', null, null, 'Evento suspendido', 'm1', '2026-08-12T05:00:00Z'),
    ('a5', 'act0000005', 's2', 'Borrador', null, 'WORKSHOP', '2026-09-20T18:00:00Z', '2026-09-20T15:00:00Z', '2026-09-20T21:00:00Z', 10, 'AUTO', 'DRAFT', null, null, null, 'm1', '2026-08-13T05:00:00Z');
  insert into legacy."ActivityPublicIdHistory" values ('h1', 'a1', 'old0000001', '2026-08-15T05:00:00Z');
  insert into legacy."Assembly" values
    ('as1', 'asm0000001', 's2', 'Asamblea ordinaria', 'Primera del semestre', 'Auditorio', 'ORDINARY', '2026-09-01T23:00:00Z', '2026-09-01T22:00:00Z', '2026-09-02T02:00:00Z', 'OPEN', null, 'm1', '2026-08-20T05:00:00Z'),
    ('as2', 'asm0000002', 's2', 'Elección de junta', null, null, 'BOARD_ELECTION', null, null, null, 'DRAFT', null, 'm1', '2026-08-21T05:00:00Z');
  insert into legacy."AssemblyPublicIdHistory" values ('ah1', 'as1', 'olda000001', '2026-08-25T05:00:00Z');
  insert into legacy."Attendance" values
    ('t1', 'a1', 'm1', 'APPROVED', '2026-08-20T18:05:00Z', '2026-08-20T18:05:00Z', 'm1', 'QR', null, null, '2026-08-20T18:05:00Z'),
    ('t2', 'a1', 'm2', 'CANCELLED', '2026-08-20T18:06:00Z', '2026-08-20T18:06:00Z', 'm1', 'LINK', '2026-08-20T18:30:00Z', 'Se fue temprano', '2026-08-20T18:30:00Z'),
    ('t3', 'a2', 'm3', 'PENDING', '2026-08-26T18:08:00Z', null, null, 'QR', null, null, '2026-08-26T18:08:00Z'),
    ('t4', 'a1', 'm3', 'APPROVED', '2026-08-20T18:07:00Z', '2026-08-20T18:07:00Z', 'm1', 'IMPORT', null, null, '2026-08-20T18:07:00Z'),
    ('t5', 'a2', 'm1', 'REJECTED', '2026-08-26T18:09:00Z', null, null, 'MICROSOFT_FORMS', null, null, '2026-08-27T10:00:00Z'),
    ('t6', 'a3', 'm1', 'APPROVED', '2026-03-10T18:05:00Z', '2026-03-10T18:05:00Z', 'm1', 'QR', null, null, '2026-03-10T18:05:00Z');
  insert into legacy."AssemblyAttendance" values
    ('aa1', 'as1', 'm1', 'CONFIRMED', '2026-09-01T23:05:00Z', 'QR', null, null, null),
    ('aa2', 'as1', 'm3', 'CANCELLED', '2026-09-01T23:06:00Z', 'ADMIN', '2026-09-01T23:30:00Z', 'Error de registro', 'm1');
  insert into legacy."PointTransaction" values
    ('p1', 'm1', 's2', 't1', 20, 'ACTIVITY', 'Asistencia: Partido de fútbol', 'm1', '2026-08-20T18:05:00Z', null),
    ('p2', 'm2', 's2', 't2', 20, 'ACTIVITY', 'Asistencia: Partido de fútbol', 'm1', '2026-08-20T18:06:00Z', null),
    ('p3', 'm2', 's2', 't2', -20, 'REVERSAL', 'Cancelación: Se fue temprano', 'm1', '2026-08-20T18:30:00Z', 'p2'),
    ('p4', 'm3', 's2', 't4', 20, 'ACTIVITY', 'Asistencia: Partido de fútbol', 'm1', '2026-08-20T18:07:00Z', null),
    ('p5', 'm1', 's2', null, 30, 'BONUS', 'Apoyo logístico', 'm1', '2026-08-21T05:00:00Z', null),
    ('p6', 'm3', 's2', null, 25, 'FLASH', 'Reto relámpago: la foto del día', 'm1', '2026-08-22T05:00:00Z', null),
    ('p7', 'm1', 's2', null, -5, 'PENALTY', 'Llegó tarde', 'm1', '2026-08-23T05:00:00Z', null),
    ('p8', 'm1', 's2', null, -25, 'REVERSAL', 'Reversión huérfana', 'm1', '2026-08-24T05:00:00Z', 'nope'),
    ('p9', 'm3', 's2', null, 15, 'WORDLE', 'Palabra del día · 4/6', null, '2026-08-25T05:00:00Z', null),
    ('p10', 'm1', 's1', 't6', 15, 'ACTIVITY', 'Asistencia: Charla del semestre pasado', 'm1', '2026-03-10T18:05:00Z', null),
    ('p11', 'm1', 's2', 't1', 20, 'ACTIVITY', 'Asistencia repetida', 'm1', '2026-08-20T19:00:00Z', null);
  insert into legacy."AssemblyRequirement" values
    ('rq1', 's1', 'm1', 2, true, null, null),
    ('rq2', 's2', 'm1', 2, true, null, null),
    ('rq3', 's2', 'm3', 1, false, 'Intercambio', 'm1');
  insert into legacy."HallOfFameSeason" values
    ('hof1', 's1', 'm1', null, null, '[{"rank": 1, "total": 15, "fullName": "Ada Admin Uno"}]', '[]', '[]', '{"activities": 1, "pointsAwarded": 15}', '2026-06-07T05:00:00Z');
  insert into legacy."CommitteeActivityScore" values
    ('cs1', 'c1', 'a1', 2, 1.000000, true),
    ('cs2', 'c2', 'a1', 3, 0.333333, true),
    ('cs3', 'c1', 'a2', 2, 0.500000, false);
`;

async function legacyClient(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("set search_path to legacy, public");
  return client;
}

describe("mapeos de GHPOINTS", () => {
  it("traduce catálogos viejos a los nuevos", () => {
    expect(seasonCode({ startDate: "2025-07-14", academicTerm: "SECOND" })).toBe("2025-2");
    expect(mapActivityCategory("SPORTS")).toBe("ATHLETIC_MATCH");
    expect(mapActivityCategory("GENERAL")).toBe("OTHER");
    expect(mapOccasionStatus("PROCESSED", false)).toBe("CLOSED");
    expect(mapOccasionStatus("OPEN", true)).toBe("CLOSED");
    expect(mapOccasionStatus("OPEN", false)).toBe("OPEN");
    expect(mapCheckInSource("MICROSOFT_FORMS")).toBe("IMPORT");
    expect(mapCheckInSource("LINK")).toBe("SELF_QR");
    expect(mapEntryKind("PENALTY")).toBe("ADJUSTMENT");
    expect(mapEntryKind("WORDLE")).toBe("LEGACY");
  });
});

describe("migración en seco desde GHPOINTS", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it(
    "migra personas, ocasiones, check-ins, ledger, requisitos y standing; es idempotente y verifica en cero",
    { timeout: 30_000 },
    async () => {
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
          activities: 5,
          assemblies: 2,
          aliases: 4,
          checkIns: 8,
          entries: 11,
          requirements: 2,
          standings: 1,
          recomputes: 3,
        });
        expect(first.warnings).toHaveLength(3);
        expect(first.warnings.join("\n")).toMatch(/edición ed1/);
        expect(first.warnings.join("\n")).toMatch(/p11 repite el crédito/);
        expect(first.warnings.join("\n")).toMatch(/p8 no tiene original/);

        // Fase 2: términos, personas, pertenencias y permisos.
        const [closed] = await getDb().select().from(term).where(eq(term.code, "2026-1"));
        const [current] = await getDb().select().from(term).where(eq(term.code, "2026-2"));
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

        // Fase 3: ocasiones con su estado, categoría, ventana y término por temporada.
        const byLegacy = async (legacyId: string) => {
          const [row] = await getDb()
            .select()
            .from(occasion)
            .where(eq(occasion.legacyId, legacyId));
          return row;
        };
        const partido = await byLegacy("a1");
        expect(partido).toMatchObject({
          publicId: "act0000001",
          kind: "ACTIVITY",
          category: "ATHLETIC_MATCH",
          status: "CLOSED",
          points: 20,
          approval: "AUTO",
          committeeId: a3?.id,
          termId: current?.id,
          description: "Partido",
        });
        expect(partido?.closedAt?.toISOString()).toBe("2026-08-20T21:00:00.000Z");
        expect(partido?.createdById).toBe(ada?.id);
        expect(await byLegacy("a2")).toMatchObject({
          status: "OPEN",
          approval: "MANUAL",
          editionId: null,
          committeeId: null,
        });
        expect(await byLegacy("a3")).toMatchObject({
          status: "CLOSED",
          category: "TALK",
          termId: closed?.id,
        });
        expect(await byLegacy("a4")).toMatchObject({
          status: "CANCELLED",
          cancelReason: "Evento suspendido",
        });
        expect(await byLegacy("a5")).toMatchObject({ status: "DRAFT" });
        const ordinaria = await byLegacy("as1");
        expect(ordinaria).toMatchObject({
          kind: "ASSEMBLY",
          assemblyKind: "ORDINARY",
          points: 0,
          location: "Auditorio",
          status: "OPEN",
        });
        expect(ordinaria?.checkInOpensAt.toISOString()).toBe("2026-09-01T22:00:00.000Z");
        const eleccion = await byLegacy("as2");
        expect(eleccion).toMatchObject({ assemblyKind: "BOARD_ELECTION", status: "DRAFT" });
        expect(eleccion?.startsAt.toISOString()).toBe("2026-08-21T05:00:00.000Z");
        expect(eleccion && eleccion.checkInOpensAt < eleccion.checkInClosesAt).toBe(true);

        // Alias: /asamblea/{publicId} y los publicId retirados.
        expect((await resolveAlias("/a/old0000001"))?.targetId).toBe(partido?.id);
        expect((await resolveAlias("/asamblea/olda000001"))?.targetId).toBe(ordinaria?.id);
        expect((await resolveAlias("/asamblea/asm0000001"))?.targetId).toBe(ordinaria?.id);
        expect((await resolveAlias("/asamblea/asm0000002"))?.targetId).toBe(eleccion?.id);

        // Check-ins: estado, fuente y decisión.
        const checkInByLegacy = async (legacyId: string) => {
          const [row] = await getDb().select().from(checkIn).where(eq(checkIn.legacyId, legacyId));
          return row;
        };
        expect(await checkInByLegacy("t1")).toMatchObject({
          status: "APPROVED",
          source: "SELF_QR",
          decidedById: ada?.id,
        });
        const anulado = await checkInByLegacy("t2");
        expect(anulado).toMatchObject({
          status: "CANCELLED",
          source: "SELF_QR",
          reason: "Se fue temprano",
        });
        expect(anulado?.decidedAt?.toISOString()).toBe("2026-08-20T18:30:00.000Z");
        expect(await checkInByLegacy("t3")).toMatchObject({ status: "PENDING", decidedAt: null });
        expect(await checkInByLegacy("t4")).toMatchObject({ status: "APPROVED", source: "IMPORT" });
        const rechazado = await checkInByLegacy("t5");
        expect(rechazado).toMatchObject({ status: "REJECTED", source: "IMPORT" });
        expect(rechazado?.decidedAt?.toISOString()).toBe("2026-08-27T10:00:00.000Z");
        expect(await checkInByLegacy("aa1")).toMatchObject({
          status: "APPROVED",
          occasionId: ordinaria?.id,
        });
        expect(await checkInByLegacy("aa2")).toMatchObject({
          status: "CANCELLED",
          source: "ADMIN",
          decidedById: ada?.id,
          reason: "Error de registro",
        });

        // Ledger: tipos, reversiones enlazadas y sumas por persona y término.
        const entryByLegacy = async (legacyId: string) => {
          const [row] = await getDb()
            .select()
            .from(pointEntry)
            .where(eq(pointEntry.legacyId, legacyId));
          return row;
        };
        const p1 = await entryByLegacy("p1");
        const p2 = await entryByLegacy("p2");
        expect(p1).toMatchObject({
          kind: "CHECKIN",
          checkInId: (await checkInByLegacy("t1"))?.id,
          legacyType: "ACTIVITY",
          points: 20,
        });
        expect(p1?.createdAt.toISOString()).toBe("2026-08-20T18:05:00.000Z");
        expect(await entryByLegacy("p3")).toMatchObject({
          kind: "REVERSAL",
          reversalOfId: p2?.id,
          checkInId: anulado?.id,
          points: -20,
        });
        expect(await entryByLegacy("p5")).toMatchObject({
          kind: "ADJUSTMENT",
          legacyType: "BONUS",
        });
        expect(await entryByLegacy("p6")).toMatchObject({ kind: "LEGACY", legacyType: "FLASH" });
        expect(await entryByLegacy("p7")).toMatchObject({
          kind: "ADJUSTMENT",
          legacyType: "PENALTY",
          points: -5,
        });
        expect(await entryByLegacy("p8")).toMatchObject({
          kind: "LEGACY",
          legacyType: "REVERSAL",
          reversalOfId: null,
        });
        expect(await entryByLegacy("p11")).toMatchObject({
          kind: "LEGACY",
          legacyType: "ACTIVITY",
        });
        expect(await balanceFor(ada?.id ?? "", current?.id ?? "")).toBe(40);
        expect(await balanceFor(ada?.id ?? "", closed?.id ?? "")).toBe(15);
        expect(await balanceFor(camila?.id ?? "", current?.id ?? "")).toBe(60);
        expect(await balanceFor(bruno?.id ?? "", current?.id ?? "")).toBe(0);

        // Requisitos: todos los del término cerrado, solo los ajustados del abierto.
        const requirements = await getDb().select().from(assemblyRequirement);
        expect(requirements).toHaveLength(2);
        expect(
          requirements.find((row) => row.termId === closed?.id && row.personId === ada?.id),
        ).toMatchObject({
          requiredOrdinary: 2,
          requiresBoardElection: true,
          requiresRunoff: false,
          adjustedReason: t("T-677"),
        });
        expect(
          requirements.find((row) => row.termId === current?.id && row.personId === camila?.id),
        ).toMatchObject({
          requiredOrdinary: 1,
          adjustedReason: "Intercambio",
          adjustedById: ada?.id,
        });

        // Standing del término cerrado: listas recalculadas del ledger y el JSON viejo bajo stats.legacy.
        const standing = await getTermStanding(closed?.id ?? "");
        expect(standing?.topNew[0]).toMatchObject({ rank: 1, personId: ada?.id, total: 15 });
        expect(standing?.topVeteran).toEqual([]);
        expect(standing?.stats.pointsAwarded).toBe(15);
        expect(standing?.stats.legacy).toMatchObject({
          activeWinnerId: "m1",
          top3Active: [{ rank: 1, total: 15, fullName: "Ada Admin Uno" }],
        });
        expect(standing?.createdAt.toISOString()).toBe("2026-06-07T05:00:00.000Z");

        // El score no se copia: el outbox lo recalcula con las pertenencias migradas.
        const before = await verifyMigration(source);
        expect(before.rows.filter((row) => row.source !== row.target)).toEqual([]);
        expect(before.warnings.join("\n")).toMatch(/2 scores congelados sin recompute/);
        await drain(50);
        const scores = await getDb()
          .select()
          .from(committeeParticipation)
          .where(
            and(
              eq(committeeParticipation.occasionId, partido?.id ?? ""),
              eq(committeeParticipation.committeeId, a3?.id ?? ""),
            ),
          );
        expect(scores[0]).toMatchObject({ eligible: 1, present: 1, rate: 1 });
        expect(scores[0]?.frozenAt).not.toBeNull();

        // Segunda corrida: nada nuevo, sin advertencias; la verificación queda en cero.
        const second = await migrateGhpoints(source, { actorId: null });
        expect(second).toMatchObject({
          terms: 0,
          committees: 0,
          people: 0,
          memberships: 0,
          committeeMemberships: 0,
          permissions: 0,
          leaders: 0,
          activities: 0,
          assemblies: 0,
          aliases: 0,
          checkIns: 0,
          entries: 0,
          requirements: 0,
          standings: 0,
          recomputes: 0,
          warnings: [],
        });
        const after = await verifyMigration(source);
        expect(after.rows.filter((row) => row.source !== row.target)).toEqual([]);
        expect(after.rows.map((row) => row.name)).toContain(
          "Pares (miembro, temporada) con SUM(points) idéntica",
        );
        expect(after.warnings).toHaveLength(3);
        expect(after.warnings.join("\n")).toMatch(/1 actividades tenían edición/);
        expect(after.warnings.join("\n")).toMatch(/1 reversiones quedaron como LEGACY/);
        expect(after.warnings.join("\n")).toMatch(/1 scores congelados con tasa cruda distinta/);
      } finally {
        await source.end();
      }
    },
  );
});
