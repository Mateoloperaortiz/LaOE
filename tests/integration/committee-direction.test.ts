import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminAreaRoles } from "@/app/admin/_kit/acceso";
import { closeDb, getDb } from "@/db/client";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import { interaction, task } from "@/modules/crm/schema";
import type { Actor } from "@/modules/identity";
import {
  addCommitteeMemberAs,
  listCommitteesMissingRequiredRoles,
  listMyCommitteeCapabilities,
  requestCommitteeRemovalAs,
  searchEligibleMembers,
  setMemberRolesAs,
} from "@/modules/people";
import { getMyMembership } from "@/modules/people/domain/committee-memberships";
import { committeeMembership, committeeRoleAssignment } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
  seedVeteran,
} from "./factories";

// La dirección del comité por áreas (ADR-058): capacidades derivadas de los cargos, alerta de cargos
// obligatorios, elegibles para entrar, y los comandos con eje comité con cada una de sus guardas.

const db = () => getDb();

async function drenar(): Promise<void> {
  for (let batch = 0; batch < 20; batch += 1) {
    const result = await drain(50);
    expect(result.failed).toBe(0);
    if (result.processed === 0) {
      return;
    }
  }
  throw new Error("El outbox no terminó");
}

interface Fixture {
  termId: string;
  a3: string;
  pixel: string;
  general: string;
  gh: string;
  logistica: string;
  member: string;
  newbie: string;
}

async function fixture(): Promise<Fixture> {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  await seedCommittee("ius", "IUS");
  const general = await seedMember("general@eafit.edu.co", {
    firstName: "Gala",
    lastName: "General",
  });
  const gh = await seedMember("gh@eafit.edu.co", { firstName: "Gema", lastName: "Humana" });
  const logistica = await seedMember("logistica@eafit.edu.co", {
    firstName: "Lucho",
    lastName: "Logi",
  });
  const member = await seedVeteran("miembro@eafit.edu.co", {
    firstName: "Mila",
    lastName: "Miembro",
  });
  const newbie = await seedMember("nuevo@eafit.edu.co", { firstName: "Nico", lastName: "Nuevo" });
  await seedCommitteeMembership(general, a3, termId, "GENERAL");
  await seedCommitteeMembership(gh, a3, termId, "GESTION_HUMANA");
  await seedCommitteeMembership(logistica, a3, termId, "LOGISTICA");
  await seedCommitteeMembership(member, a3, termId);
  await seedCommitteeMembership(member, pixel, termId);
  return { termId, a3, pixel, general, gh, logistica, member, newbie };
}

const actor = (personId: string) => ({ personId });
const director = { isAdmin: false, allCapabilities: false };
const admin = { isAdmin: true, allCapabilities: true };

describe("capacidades por cargo", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("deriva las capacidades de los cargos vivos de dirección con membresía que opera", async () => {
    const f = await fixture();
    const [ghA3] = await listMyCommitteeCapabilities(f.gh, f.termId);
    expect(ghA3?.committee.slug).toBe("a3");
    expect(ghA3?.capabilities).toEqual(["ROSTER", "PERMANENCE"]);
    expect(ghA3?.isGeneral).toBe(false);
    const [generalA3] = await listMyCommitteeCapabilities(f.general, f.termId);
    expect(generalA3?.capabilities).toHaveLength(9);
    expect(generalA3?.isGeneral).toBe(true);
    expect(await listMyCommitteeCapabilities(f.member, f.termId)).toEqual([]);

    // En licencia se conservan las capacidades del cargo de mesa sobre su comité (Regl. art. 27
    // par. 6; ADR-060 regla 10); una membresía terminada no opera.
    const onLeave = await seedPerson("licencia@eafit.edu.co");
    await seedMembership(onLeave, f.termId, "ON_LEAVE");
    await seedCommitteeMembership(onLeave, f.pixel, f.termId, "GENERAL");
    expect((await listMyCommitteeCapabilities(onLeave, f.termId))[0]).toMatchObject({
      isGeneral: true,
    });
    const inactive = await seedPerson("baja@eafit.edu.co");
    await seedMembership(inactive, f.termId, "INACTIVE");
    await seedCommitteeMembership(inactive, f.pixel, f.termId, "FINANCIERO");
    expect(await listMyCommitteeCapabilities(inactive, f.termId)).toEqual([]);
  });

  it("avisa qué comités con gente quedaron sin un cargo obligatorio", async () => {
    const f = await fixture();
    const missing = await listCommitteesMissingRequiredRoles(f.termId);
    expect(missing.map((row) => [row.committee.slug, row.missing.map((r) => r.roleCode)])).toEqual([
      ["a3", ["FINANCIERO"]],
      ["pixel", ["GENERAL", "FINANCIERO"]],
    ]);
  });

  it("busca elegibles activos que no estén ya en el comité, sin correo", async () => {
    const f = await fixture();
    const found = await searchEligibleMembers(f.a3, f.termId, "Nico");
    expect(found.map((row) => [row.fullName, row.committeeCount])).toEqual([["Nico Nuevo", 0]]);
    expect(found[0]).not.toHaveProperty("email");
    expect(await searchEligibleMembers(f.a3, f.termId, "Gema")).toEqual([]);
    expect(
      (await searchEligibleMembers(f.pixel, f.termId, "Gema")).map((r) => r.committeeCount),
    ).toEqual([1]);
  });
});

describe("agregar, cargos y pedido de retiro", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("GH agrega miembros con cupo y activos; los cargos de dirección los da el General", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    await expect(
      addCommitteeMemberAs(actor(f.member), scope, director, { personId: f.newbie, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("No tenés a cargo") });
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, {
        personId: f.newbie,
        roles: [{ roleCode: "LOGISTICA", coDirector: false }],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("General del comité") });

    const added = await addCommitteeMemberAs(actor(f.gh), scope, director, {
      personId: f.newbie,
      roles: [],
    });
    expect(added.revived).toBe(false);
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, { personId: f.newbie, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("ya está en este comité") });

    const onLeave = await seedPerson("licencia@eafit.edu.co");
    await seedMembership(onLeave, f.termId, "ON_LEAVE");
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, { personId: onLeave, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("activos") });

    const full = await seedMember("lleno@eafit.edu.co", { firstName: "Lleno", lastName: "Total" });
    for (const id of [f.pixel, await seedCommittee("cigma"), await seedCommittee("eco")]) {
      await seedCommitteeMembership(full, id, f.termId);
    }
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, { personId: full, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("3 comités") });

    // El General nombra con cargos, y el cargo principal derivado queda en la pertenencia.
    const co = await seedVeteran("co@eafit.edu.co", { firstName: "Cora", lastName: "Codi" });
    await addCommitteeMemberAs(actor(f.general), scope, director, {
      personId: co,
      roles: [
        { roleCode: "MERCADEO", coDirector: false },
        { roleCode: "GENERAL", coDirector: true },
      ],
    });
    const mine = await getMyMembership(co);
    expect(mine.committees.map((item) => item.roleCode)).toEqual(["GENERAL"]);
    // Publicidad quedó retirado del catálogo de comités (ADR-060 regla 4): no se nombra nuevo.
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, {
        personId: co,
        roles: [{ roleCode: "PUBLICIDAD", coDirector: false }],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("Mercadeo") });
    const [audit] = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "committee-membership.added"))
      .orderBy(desc(auditLog.at))
      .limit(1);
    expect(audit?.entityId).toBe(co);
    const events = await db()
      .select({ type: outbox.eventType })
      .from(outbox)
      .where(eq(outbox.eventType, "committee-membership.changed"));
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("cambia cargos con sus guardas: propia fila, dirección, obligatorios y titular repetido", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    const logistica = [{ roleCode: "LOGISTICA", coDirector: false }];
    await expect(
      setMemberRolesAs(actor(f.gh), scope, director, { personId: f.member, roles: logistica }),
    ).rejects.toMatchObject({ message: expect.stringContaining("General del comité") });
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, { personId: f.general, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("propia pertenencia") });
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, { personId: f.newbie, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("ya no está en el comité") });

    // Un segundo titular de Logística choca; la codirección convive.
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, { personId: f.member, roles: logistica }),
    ).rejects.toMatchObject({ message: expect.stringContaining("A3 ya tiene Logística") });
    const changed = await setMemberRolesAs(actor(f.general), scope, director, {
      personId: f.member,
      roles: [{ roleCode: "LOGISTICA", coDirector: true }],
    });
    expect(changed).toEqual({ changed: true });
    expect(
      await setMemberRolesAs(actor(f.general), scope, director, {
        personId: f.member,
        roles: [{ roleCode: "LOGISTICA", coDirector: true }],
      }),
    ).toEqual({ changed: false });

    // Nombrar Financiero titular; el General no puede dejar el cargo obligatorio vacío, ADMIN sí.
    await setMemberRolesAs(actor(f.general), scope, director, {
      personId: f.member,
      roles: [{ roleCode: "FINANCIERO", coDirector: false }],
    });
    expect(await listCommitteesMissingRequiredRoles(f.termId)).toEqual([
      expect.objectContaining({
        missing: [
          { roleCode: "GENERAL", roleLabel: "General" },
          { roleCode: "FINANCIERO", roleLabel: "Financiero" },
        ],
      }),
    ]);
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, { personId: f.member, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("sin Financiero titular") });
    await setMemberRolesAs(actor(f.general), scope, admin, { personId: f.member, roles: [] });
    const rows = await db()
      .select({ roleCode: committeeMembership.roleCode })
      .from(committeeMembership)
      .where(
        and(eq(committeeMembership.personId, f.member), eq(committeeMembership.committeeId, f.a3)),
      );
    expect(rows[0]?.roleCode).toBe("MIEMBRO");
    const live = await db()
      .select()
      .from(committeeRoleAssignment)
      .where(
        and(
          eq(committeeRoleAssignment.personId, f.member),
          eq(committeeRoleAssignment.committeeId, f.a3),
        ),
      );
    expect(live.every((row) => row.endedAt !== null)).toBe(true);
    const audits = await db()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.action, "committee-roles.set"));
    expect(audits.length).toBe(3);
  });

  it("pide a GH un retiro: tarea sin responsable, idempotente, y línea de tiempo", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    await expect(
      requestCommitteeRemovalAs(actor(f.gh), scope, director, { personId: f.gh, reason: "Me voy" }),
    ).rejects.toBeInstanceOf(DomainError);
    await requestCommitteeRemovalAs(actor(f.gh), scope, director, {
      personId: f.member,
      reason: "No volvió a las reuniones",
    });
    await drenar();
    const tasks = await db().select().from(task).where(eq(task.personId, f.member));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "COMMITTEE_REMOVAL", status: "OPEN", assigneeId: null });
    expect(tasks[0]?.title).toContain("Mila Miembro");
    expect(tasks[0]?.title).toContain("A3");
    expect(tasks[0]?.dueAt).not.toBeNull();

    await requestCommitteeRemovalAs(actor(f.gh), scope, director, {
      personId: f.member,
      reason: "No volvió a las reuniones",
    });
    await drenar();
    expect(await db().select().from(task).where(eq(task.personId, f.member))).toHaveLength(1);
    const notes = await db()
      .select({ summary: interaction.summary })
      .from(interaction)
      .where(eq(interaction.personId, f.member));
    expect(notes.some((row) => row.summary.includes("Pidieron a GH su retiro de A3"))).toBe(true);
    const still = await db()
      .select({ leftAt: committeeMembership.leftAt })
      .from(committeeMembership)
      .where(
        and(eq(committeeMembership.personId, f.member), eq(committeeMembership.committeeId, f.a3)),
      );
    expect(still[0]?.leftAt).toBeNull();
  });
});

describe("roles del área de administración", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  const actorFor = (personId: string): Actor => ({
    personId,
    sessionId: "s",
    email: "x@eafit.edu.co",
    name: "X",
    firstName: "X",
    membershipStatus: "ACTIVE",
    permissions: [],
    otpVerifiedAt: new Date(),
    sessionLastSeenAt: new Date(),
    sessionRemembered: false,
    isAdmin: false,
  });

  it("la dirección entra al admin con su comité y sus capacidades; un miembro no", async () => {
    const f = await fixture();
    const gh = await adminAreaRoles(actorFor(f.gh));
    expect(gh.any).toBe(true);
    expect(
      gh.committees.map((item) => [item.committee.slug, item.capabilities, item.isLeader]),
    ).toEqual([["a3", ["ROSTER", "PERMANENCE"], false]]);
    const member = await adminAreaRoles(actorFor(f.member));
    expect(member).toMatchObject({ any: false, committees: [] });
  });
});
