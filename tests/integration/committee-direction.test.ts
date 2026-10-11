import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adminAreaRoles } from "@/app/_authz/admin-area";
import { closeDb, getDb } from "@/db/client";
import { interaction, task } from "@/modules/crm/schema";
import type { Actor } from "@/modules/identity";
import {
  addCommitteeMemberAs,
  anonymizePersonAs,
  endMembershipAs,
  listCommitteesMissingRequiredRoles,
  listMyCommitteeCapabilities,
  requestCommitteeRemovalAs,
  requestDeletionAs,
  searchEligibleMembers,
  setCommitteeMemberships,
  setMemberRolesAs,
} from "@/modules/people";
import { addCommitteeMember } from "@/modules/people/domain/committee-direction";
import { getMyMembership } from "@/modules/people/domain/committee-memberships";
import { endMembership } from "@/modules/people/domain/membership";
import { committeeMembership, committeeRoleAssignment } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
  seedVeteran,
} from "../factories";
import { copyPattern } from "../helpers/copy";
import {
  firstThenSecond,
  holdCommand,
  holdTransaction,
  outcome,
  waitingOn,
} from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// La dirección del comité por áreas (ADR-058): capacidades derivadas de los cargos, alerta de cargos
// obligatorios, elegibles para entrar, y los comandos con eje comité con cada una de sus guardas.

const db = () => getDb();

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

const actor = (personId: string) => ({ personId, ip: null });
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
    ).rejects.toMatchObject({ message: expect.stringMatching(copyPattern("T-2162")) });
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, {
        personId: f.newbie,
        roles: [{ roleCode: "LOGISTICA", coDirector: false }],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2167")) });

    const added = await addCommitteeMemberAs(actor(f.gh), scope, director, {
      personId: f.newbie,
      roles: [],
    });
    expect(added.revived).toBe(false);
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, { personId: f.newbie, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringMatching(copyPattern("T-2165")) });

    const onLeave = await seedPerson("licencia@eafit.edu.co");
    await seedMembership(onLeave, f.termId, "ON_LEAVE");
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, { personId: onLeave, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2164")) });

    const full = await seedMember("lleno@eafit.edu.co", { firstName: "Lleno", lastName: "Total" });
    for (const id of [f.pixel, await seedCommittee("cigma"), await seedCommittee("eco")]) {
      await seedCommitteeMembership(full, id, f.termId);
    }
    await expect(
      addCommitteeMemberAs(actor(f.gh), scope, director, { personId: full, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringMatching(copyPattern("T-2166", { max: 3 })) });

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
    ).rejects.toMatchObject({
      message: expect.stringMatching(copyPattern("T-2212", { nuevo: "Mercadeo" })),
    });
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

  // ADR-118 regla 11 por «Agregar»: el estado y el cupo se leen con la fila de la membresía tomada,
  // la misma que toman la baja y el cambio de comités.
  const BAJA = { endReason: "RESIGNATION", memorialConsent: false, contactConsent: false } as const;

  async function vivasDe(personId: string): Promise<string[]> {
    const rows = await db()
      .select({ committeeId: committeeMembership.committeeId })
      .from(committeeMembership)
      .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
    return rows.map((row) => row.committeeId).sort();
  }

  async function enCola(held: { pid: number; release: () => void; done: Promise<unknown> }) {
    try {
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBeGreaterThan(0), {
        timeout: 5_000,
      });
    } finally {
      held.release();
      await held.done;
    }
  }

  it("si la baja entra primero, el «Agregar» que hacía cola responde que la persona no está activa", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    const held = await holdCommand(actor(f.gh), (ctx) => endMembership(ctx, f.newbie, BAJA));
    const agregar = addCommitteeMemberAs(actor(f.gh), scope, director, {
      personId: f.newbie,
      roles: [],
    }).then(
      () => "agregada",
      (error: unknown) => error,
    );
    await enCola(held);

    expect(await agregar).toEqual(new DomainError(t("T-2164"), "personId"));
    expect(await vivasDe(f.newbie)).toEqual([]);
  });

  it("si el «Agregar» entra primero, la baja que hacía cola cierra también esa pertenencia", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    const held = await holdCommand(actor(f.gh), (ctx) =>
      addCommitteeMember(ctx, scope, director, { personId: f.newbie, roles: [] }),
    );
    const baja = endMembershipAs(actor(f.gh), f.newbie, BAJA);
    await enCola(held);
    await baja;

    expect(await vivasDe(f.newbie)).toEqual([]);
  });

  it("si GH saca a la persona del comité primero, el cambio de cargos que hacía cola responde que ya no es del comité (DT-325)", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    // Mila está en A3 y PIXEL. GH la deja solo en PIXEL: queda escrito y sin confirmar.
    const held = await holdCommand(actor(f.gh), (ctx) =>
      setCommitteeMemberships(ctx, f.member, f.termId, [{ committeeId: f.pixel }]),
    );
    const cambio = setMemberRolesAs(actor(f.gh), scope, admin, {
      personId: f.member,
      roles: [{ roleCode: "MERCADEO", coDirector: false }],
    }).then(
      () => "cambiados",
      (error: unknown) => error,
    );
    await enCola(held);

    expect(await cambio).toEqual(new DomainError(t("T-2173"), "personId"));
    const live = await db()
      .select({ roleCode: committeeRoleAssignment.roleCode })
      .from(committeeRoleAssignment)
      .where(
        and(
          eq(committeeRoleAssignment.personId, f.member),
          eq(committeeRoleAssignment.committeeId, f.a3),
          isNull(committeeRoleAssignment.endedAt),
        ),
      );
    expect(live).toEqual([]);
  });

  it("si anonimizan a la persona mientras la dirección le cambia los cargos, la anonimización hace cola y los dos terminan, sin interbloqueo (DT-325)", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    await requestDeletionAs(actor(f.member));
    // El cambio de cargos ya tomó la fila de la membresía de Mila y se detiene en el consultivo de las
    // inhabilidades, antes de escribir el cargo, que es lo que referencia su fila de `person`.
    const held = await holdTransaction((tx) =>
      tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`leadership:${f.member}`}, 0))`,
      ),
    );

    const [changed, anonymized] = await firstThenSecond(
      held,
      () =>
        setMemberRolesAs(actor(f.gh), scope, admin, {
          personId: f.member,
          roles: [{ roleCode: "MERCADEO", coDirector: false }],
        }),
      () => anonymizePersonAs(actor(f.gh), f.member),
    );

    expect([outcome(changed), outcome(anonymized)]).toEqual(["ok", "ok"]);
    // La anonimización entró después: cierra las pertenencias y, con ellas, el cargo recién puesto.
    expect(await vivasDe(f.member)).toEqual([]);
    const live = await db()
      .select({ roleCode: committeeRoleAssignment.roleCode })
      .from(committeeRoleAssignment)
      .where(
        and(
          eq(committeeRoleAssignment.personId, f.member),
          isNull(committeeRoleAssignment.endedAt),
        ),
      );
    expect(live).toEqual([]);
  });

  it("dos «Agregar» a la vez de la misma persona no la dejan con un comité de más (DT-209 c)", async () => {
    const f = await fixture();
    const cigma = await seedCommittee("cigma", "CIGMA");
    const eco = await seedCommittee("eco", "ECO");
    // Mila ya está en A3 y PIXEL: le queda un cupo de los tres.
    const held = await holdCommand(actor(f.gh), (ctx) =>
      addCommitteeMember(ctx, { committeeId: cigma, termId: f.termId }, admin, {
        personId: f.member,
        roles: [],
      }),
    );
    const segundo = addCommitteeMemberAs(
      actor(f.gh),
      { committeeId: eco, termId: f.termId },
      admin,
      { personId: f.member, roles: [] },
    ).then(
      () => "agregada",
      (error: unknown) => error,
    );
    await enCola(held);

    expect(await segundo).toMatchObject({
      message: expect.stringMatching(copyPattern("T-2166", { max: 3 })),
    });
    expect(await vivasDe(f.member)).toEqual([f.a3, f.pixel, cigma].sort());
  });

  it("cambia cargos con sus guardas: propia fila, dirección, obligatorios y titular repetido", async () => {
    const f = await fixture();
    const scope = { committeeId: f.a3, termId: f.termId };
    const logistica = [{ roleCode: "LOGISTICA", coDirector: false }];
    await expect(
      setMemberRolesAs(actor(f.gh), scope, director, { personId: f.member, roles: logistica }),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2167")) });
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, { personId: f.general, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2163")) });
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, { personId: f.newbie, roles: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2173")) });

    // Un segundo titular de Logística choca; la codirección convive.
    await expect(
      setMemberRolesAs(actor(f.general), scope, director, { personId: f.member, roles: logistica }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(t("T-452", { comité: "A3", cargo: "Logística" })),
    });
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
    ).rejects.toMatchObject({
      message: expect.stringContaining(t("T-2168", { cargo: "Financiero" })),
    });
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
    await drainOutbox();
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
    await drainOutbox();
    expect(await db().select().from(task).where(eq(task.personId, f.member))).toHaveLength(1);
    const notes = await db()
      .select({ summary: interaction.summary })
      .from(interaction)
      .where(eq(interaction.personId, f.member));
    expect(
      notes.some((row) =>
        row.summary.includes(t("T-2171", { comité: "A3", motivo: "No volvió a las reuniones" })),
      ),
    ).toBe(true);
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
