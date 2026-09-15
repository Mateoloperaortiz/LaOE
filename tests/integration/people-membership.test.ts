import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain } from "@/jobs/poller";
import { grantPermission } from "@/modules/identity/domain/permissions";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import "@/modules/identity/jobs";
import { permission, session } from "@/modules/identity/schema";
import {
  getMyMembership,
  setCommitteeMemberships,
} from "@/modules/people/domain/committee-memberships";
import { listConsents } from "@/modules/people/domain/consents";
import {
  anonymizePerson,
  changeMembershipStatus,
  endMembership,
  listMembershipEvents,
  reactivateMembership,
} from "@/modules/people/domain/membership";
import { getPerson360 } from "@/modules/people/domain/person-360";
import { listPeople, updatePerson } from "@/modules/people/domain/persons";
import { committeeMembership, membership, membershipTerm, person } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembershipTerm,
  seedPerson,
  seedTerm,
  seedVeteran,
} from "./factories";

const db = () => getDb();

async function openSession(personId: string): Promise<string> {
  const { token } = await createSession(db(), {
    personId,
    remember: false,
    userAgent: null,
    ip: null,
  });
  return token;
}

describe("acceso al cambiar estado o correo", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("la licencia conserva la sesión de consulta y el cambio de correo sigue revocándola", async () => {
    const personId = await seedMember("miembro@eafit.edu.co");
    const token = await openSession(personId);
    expect(await resolveActor(token)).not.toBeNull();

    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, {
        to: "ON_LEAVE",
        reason: "Semestre afuera",
        leaveUntil: "2027-01-31",
      }),
    );
    expect(await resolveActor(token)).toMatchObject({ membershipStatus: "ON_LEAVE" });
    const events = await listMembershipEvents(personId);
    expect(events.map((event) => event.toStatus)).toEqual(["ON_LEAVE"]);

    // La licencia conserva la sesión, también después del outbox.
    await drain(20);
    const [sessions] = await db()
      .select({ n: count() })
      .from(session)
      .where(eq(session.personId, personId));
    expect(sessions?.n).toBe(1);

    // Al volver a activo sigue disponible la sesión que no fue revocada.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, { to: "ACTIVE", reason: "Volvió" }),
    );
    const fresh = await openSession(personId);
    expect(await resolveActor(fresh)).not.toBeNull();

    // Cambiar el correo también invalida las sesiones creadas antes.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updatePerson(ctx, personId, {
        firstName: "Persona",
        lastName: "Sintética",
        email: "nuevo@eafit.edu.co",
        kind: "STUDENT",
      }),
    );
    expect(await resolveActor(fresh)).toBeNull();
    const otherId = await seedPerson("otra@eafit.edu.co");
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        updatePerson(ctx, otherId, {
          firstName: "Otra",
          lastName: "Persona",
          email: "nuevo@eafit.edu.co",
          kind: "STUDENT",
        }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("salida, reactivación y anonimización", () => {
  beforeEach(truncateAll);

  it("la licencia exige regreso dentro de un año y al volver retoma la condición que tenía (ADR-060 regla 10)", async () => {
    const previo = await seedTerm("2026-1");
    const personId = await seedMember("condicion@eafit.edu.co", { entryTermCode: "2026-1" });
    await seedMembershipTerm(personId, previo, true);
    const hoy = new Date("2026-06-01T15:00:00Z");
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        changeMembershipStatus(ctx, personId, { to: "ON_LEAVE", reason: "Sin fecha" }, hoy),
      ),
    ).rejects.toThrow(new DomainError(t("T-2274"), "leaveUntil"));
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        changeMembershipStatus(
          ctx,
          personId,
          { to: "ON_LEAVE", reason: "Muy larga", leaveUntil: "2027-06-02" },
          hoy,
        ),
      ),
    ).rejects.toThrow(/máximo un año/);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(
        ctx,
        personId,
        { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2027-06-01" },
        hoy,
      ),
    );
    const leaveUntilOf = async () =>
      (
        await db()
          .select({ leaveUntil: membership.leaveUntil })
          .from(membership)
          .where(eq(membership.personId, personId))
      )[0]?.leaveUntil;
    expect(await leaveUntilOf()).toBe("2027-06-01");

    // Al volver: sin regreso previsto y con la prueba del término anterior copiada al actual.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, { to: "ACTIVE", reason: "Volvió" }),
    );
    expect(await leaveUntilOf()).toBeNull();
    const condiciones = await db()
      .select({
        termId: membershipTerm.termId,
        probation: membershipTerm.probation,
        reason: membershipTerm.reason,
      })
      .from(membershipTerm)
      .where(eq(membershipTerm.personId, personId));
    expect(condiciones).toHaveLength(2);
    const actual = condiciones.find((row) => row.termId !== previo);
    expect(actual).toMatchObject({ probation: true, reason: t("T-2276") });
  });

  it("dar de baja depura lo que no es historia y registra los consentimientos; reactivar recupera el perfil", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("egresa@eafit.edu.co", { phone: "+573001234567" });
    const a3 = await seedCommittee("a3");
    await seedCommitteeMembership(personId, a3, termId, "GENERAL");
    const adminId = await seedMember("admin@eafit.edu.co");
    await runCommand({ personId: adminId }, (ctx) =>
      grantPermission(ctx, { email: "admin@eafit.edu.co", code: "ADMIN" }),
    );
    await runCommand({ personId: adminId }, (ctx) =>
      grantPermission(ctx, {
        email: "egresa@eafit.edu.co",
        code: "COMMITTEE_LEADER",
        committeeId: a3,
      }),
    );

    const ended = await runCommand({ personId: adminId }, (ctx) =>
      endMembership(ctx, personId, {
        endReason: "GRADUATION",
        memorialConsent: true,
        contactConsent: false,
        personalEmail: "egresa@example.com",
      }),
    );
    expect(ended).toBe(true);
    const data = await getPerson360(personId);
    expect(data?.person.stage).toBe("ALUMNI");
    expect(data?.person.phone).toBeNull();
    expect(data?.person.personalEmail).toBe("egresa@example.com");
    expect(data?.membership).toMatchObject({
      status: "INACTIVE",
      endReason: "GRADUATION",
      lastTermId: termId,
    });
    expect(data?.membership?.endedAt).toBeInstanceOf(Date);
    expect(data?.committeesByTerm[0]?.items[0]?.leftAt).toBeInstanceOf(Date);
    // El historial conserva el cargo cerrado; el roster vivo ya no lo devuelve.
    expect(data?.roleHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "A3", label: "General", endedAt: expect.any(Date) }),
      ]),
    );
    const consents = await listConsents(personId);
    expect(consents.find((item) => item.purpose === "MEMORIAL")?.live).toEqual(expect.anything());
    expect(consents.find((item) => item.purpose === "COMMUNICATIONS")?.live).toBeNull();
    // Segunda baja: no hace nada.
    expect(
      await runCommand({ personId: adminId }, (ctx) =>
        endMembership(ctx, personId, {
          endReason: "OTHER",
          memorialConsent: false,
          contactConsent: false,
        }),
      ),
    ).toBe(false);

    // El outbox revoca los permisos de quien salió y respeta al último ADMIN.
    await drain(20);
    const remaining = await db().select().from(permission);
    expect(remaining.map((row) => row.code)).toEqual(["ADMIN"]);

    await runCommand({ personId: adminId }, (ctx) =>
      reactivateMembership(ctx, personId, { email: "egresa2@eafit.edu.co", reason: "Posgrado" }),
    );
    const back = await getPerson360(personId);
    expect(back?.person.stage).toBe("MEMBER");
    expect(back?.person.email).toBe("egresa2@eafit.edu.co");
    expect(back?.membership).toMatchObject({ status: "ACTIVE", endedAt: null, endReason: null });
    expect(back?.events.map((event) => `${event.fromStatus}>${event.toStatus}`)).toEqual([
      "ACTIVE>INACTIVE",
      "INACTIVE>ACTIVE",
    ]);
    const [audits] = await db().select({ n: count() }).from(auditLog);
    expect(audits?.n).toBeGreaterThanOrEqual(4);
  });

  it("una persona expulsada no se reactiva (Regl. art. 61.3; ADR-060 regla 3)", async () => {
    await seedTerm();
    const personId = await seedMember("expulsada@eafit.edu.co");
    const adminId = await seedMember("admin2@eafit.edu.co");
    await runCommand({ personId: adminId }, (ctx) =>
      endMembership(ctx, personId, {
        endReason: "EXPULSION",
        note: "Falta grave con otra sanción viva",
        memorialConsent: false,
        contactConsent: false,
      }),
    );
    await expect(
      runCommand({ personId: adminId }, (ctx) =>
        reactivateMembership(ctx, personId, { reason: "Pidió volver" }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    const data = await getPerson360(personId);
    expect(data?.membership).toMatchObject({ status: "INACTIVE", endReason: "EXPULSION" });
    expect(data?.person.stage).toBe("ALUMNI");
  });

  it("anonimizar exige la solicitud, borra nombre y contacto, conserva las pertenencias y limpia la auditoría", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("borrar@eafit.edu.co", {
      firstName: "Nombre",
      lastName: "Real",
      phone: "+573001112233",
    });
    const pixel = await seedCommittee("pixel");
    await seedCommitteeMembership(personId, pixel, termId);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updatePerson(ctx, personId, {
        firstName: "Nombre",
        lastName: "Real",
        email: "borrar@eafit.edu.co",
        kind: "STUDENT",
        program: "Derecho",
      }),
    );
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, personId)),
    ).rejects.toBeInstanceOf(DomainError);

    await db()
      .update(person)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(person.id, personId));
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, personId));

    const [who] = await db().select().from(person).where(eq(person.id, personId));
    expect(who?.firstName).toBe("Egresado");
    expect(who?.email).toBe(`eliminado.${personId}@anonimo.invalid`);
    expect(who?.phone).toBeNull();
    expect(who?.program).toBeNull();
    expect(who?.anonymizedAt).toBeInstanceOf(Date);
    expect(who?.stage).toBe("ALUMNI");
    const [memberships] = await db()
      .select({ n: count() })
      .from(committeeMembership)
      .where(eq(committeeMembership.personId, personId));
    expect(memberships?.n).toBe(1);
    const [row] = await db().select().from(membership).where(eq(membership.personId, personId));
    expect(row?.status).toBe("INACTIVE");
    const entries = await db().select().from(auditLog).where(eq(auditLog.entityId, personId));
    const withContent = entries.filter(
      (entry) => entry.action !== "person.anonymized" && (entry.before || entry.after),
    );
    expect(withContent).toHaveLength(0);
    expect(JSON.stringify(entries)).not.toContain("Derecho");
    // Idempotente.
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, personId));
  });
});

describe("comités del término", () => {
  beforeEach(truncateAll);

  it("exige entre 1 y 3 comités para activos, un General por comité y cierra lo que ya no figura", async () => {
    const termId = await seedTerm();
    // Veteranos: un nuevo no recibe cargo de mesa sin aval (ADR-060 regla 11).
    const personId = await seedVeteran("uno@eafit.edu.co");
    const other = await seedVeteran("dos@eafit.edu.co");
    const ids = await Promise.all(["a3", "pixel", "ius", "eco"].map((slug) => seedCommittee(slug)));
    const [a3, pixel, ius, eco] = ids as [string, string, string, string];

    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => setCommitteeMemberships(ctx, personId, termId, [])),
    ).rejects.toMatchObject({ message: expect.stringContaining("entre 1 y 3") });
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        setCommitteeMemberships(
          ctx,
          personId,
          termId,
          ids.map((committeeId) => ({ committeeId, roleCode: "MIEMBRO", transferredIn: false })),
        ),
      ),
    ).rejects.toBeInstanceOf(DomainError);

    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, personId, termId, [
        { committeeId: a3, roleCode: "GENERAL", transferredIn: false },
        { committeeId: pixel, roleCode: "MIEMBRO", transferredIn: true },
      ]),
    );
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        setCommitteeMemberships(ctx, other, termId, [
          { committeeId: a3, roleCode: "GENERAL", transferredIn: false },
        ]),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("A3") });
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        setCommitteeMemberships(ctx, other, termId, [
          { committeeId: a3, roleCode: "INVENTADO", transferredIn: false },
        ]),
      ),
    ).rejects.toBeInstanceOf(DomainError);

    // El General deja A3 y pasa a IUS; A3 queda cerrada y otra persona puede ser General.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, personId, termId, [
        { committeeId: pixel, roleCode: "MIEMBRO", transferredIn: true },
        { committeeId: ius, roleCode: "LOGISTICA", transferredIn: false },
      ]),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, other, termId, [
        { committeeId: a3, roleCode: "GENERAL", transferredIn: false },
        { committeeId: eco, roleCode: "MIEMBRO", transferredIn: false },
      ]),
    );
    const mine = await getMyMembership(personId);
    expect(mine.term?.id).toBe(termId);
    expect(mine.committees.map((item) => `${item.committeeName}:${item.roleCode}`)).toEqual([
      "IUS:LOGISTICA",
      "PIXEL:MIEMBRO",
    ]);
    const listed = await listPeople({ q: "", committeeId: a3, page: 1, pageSize: 10 });
    expect(listed.rows.map((row) => row.email)).toEqual(["dos@eafit.edu.co"]);
    expect(listed.rows[0]?.committees).toEqual(["A3 · General", "ECO · Miembro"]);
  });
});
