import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { requestDecided } from "@/domain-events/crm";
import { eventOf } from "@/domain-events/define";
import { setMailTransportsForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import {
  countPendingRequests,
  createRequestAs,
  decideRequestAs,
  getRequest,
  listRequests,
  listRequestsByPerson,
  withdrawRequestAs,
} from "@/modules/crm";
import { interaction, task } from "@/modules/crm/schema";
import {
  changeMembershipStatusAs,
  endMembershipAs,
  getMembershipRef,
  getMyMembership,
  hasLiveConsent,
  listConsents,
  setCommitteeMembershipsAs,
} from "@/modules/people";
import {
  committeeMembership,
  committeeRoleAssignment,
  membership,
  person,
} from "@/modules/people/schema";
import { findTermByCode, nextTermCode } from "@/modules/terms";
import type { MailTransport } from "@/shared/adapters/mail";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { copyPattern, itemPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  currentTermCode,
  leaveUntilSoon,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedPerson,
  seedTerm,
  seedVeteran,
} from "./factories";

// Solicitudes (ADR-031, ADR-037 regla 9): una pendiente por tipo, retirar, rechazar con motivo,
// aprobar ejecuta el comando de people en la misma transacción y la respuesta sale por correo.

const _admin = { personId: null, ip: null };

// Regreso previsto dentro de la ventana (ADR-060 regla 10): en dos meses.
const until = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString().slice(0, 10);
const tipoLicencia = tList("T-894")[0];

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

function fakeTransport(): MailTransport {
  return { name: "resend", send: async () => ({ id: "re_ok" }) };
}

async function activeMember(email: string, slug = "a3") {
  const termId = await seedTerm();
  const personId = await seedMember(email);
  const a3 = await seedCommittee(slug, slug.toUpperCase());
  await seedCommitteeMembership(personId, a3, termId);
  return { termId, personId, a3, actor: { personId, ip: null } };
}

describe("solicitudes", () => {
  beforeEach(truncateAll);
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("una decisión con un estado que comms no conoce no se comunica como «no aprobada»", async () => {
    setMailTransportsForTests({ primary: fakeTransport(), overflow: null });
    const { personId } = await activeMember("estado.futuro@eafit.edu.co");
    const evento = (status: string, requestId: string) =>
      eventOf(requestDecided, {
        actorId: null,
        personId,
        requestId,
        kind: "LEAVE",
        kindLabel: "licencia",
        status,
        reason: null,
        email: "estado.futuro@eafit.edu.co",
        firstName: "Ana",
      });

    await runCommand(SYSTEM_ACTOR, (ctx) => ctx.emit(evento("ESTADO_FUTURO", "solicitud-1")));
    await drainOutbox();
    expect(await getDb().select().from(message).where(eq(message.personId, personId))).toHaveLength(
      0,
    );

    await runCommand(SYSTEM_ACTOR, (ctx) => ctx.emit(evento("REJECTED", "solicitud-2")));
    await drainOutbox();
    const enviados = await getDb().select().from(message).where(eq(message.personId, personId));
    expect(enviados.length).toBeGreaterThan(0);
  });

  it("solo un miembro activo, una pendiente por tipo, con tarea para GH y retirable", async () => {
    const { personId, actor } = await activeMember("miembro@eafit.edu.co");
    const prospect = await seedPerson("prospecto@gmail.com");
    await expect(
      createRequestAs({ personId: prospect, ip: null }, "LEAVE", { reason: "Viaje" }),
    ).rejects.toThrow(t("T-892"));
    await expect(createRequestAs(actor, "LEAVE", { reason: "x", until })).rejects.toThrow();
    // Sin regreso o fuera de la ventana de un año no hay solicitud (ADR-060 regla 10).
    await expect(createRequestAs(actor, "LEAVE", { reason: "Sin fecha" })).rejects.toThrow();
    await expect(
      createRequestAs(actor, "LEAVE", { reason: "Muy larga", until: "2099-01-01" }),
    ).rejects.toThrow(copyPattern("T-2275"));
    const created = await createRequestAs(actor, "LEAVE", {
      reason: "Intercambio",
      until,
    });
    const view = await getRequest(created.id);
    expect(view).toMatchObject({ status: "PENDING", kind: "LEAVE", personId });
    expect(view?.detail).toMatch(itemPattern(tList("T-1010")[0]));
    const [opened] = await getDb().select().from(task).where(eq(task.personId, personId));
    expect(opened).toMatchObject({
      kind: "REQUEST",
      status: "OPEN",
      title: t("T-1009", { nombre: "Persona Sintética", tipo: tipoLicencia }),
    });
    expect(view?.taskId).toBe(opened?.id);
    await expect(createRequestAs(actor, "LEAVE", { reason: "Otra vez", until })).rejects.toThrow(
      t("T-891", { tipo: tipoLicencia }),
    );
    expect(await countPendingRequests()).toBe(1);
    await withdrawRequestAs(actor, created.id);
    expect((await getRequest(created.id))?.status).toBe("WITHDRAWN");
    const [closed] = await getDb()
      .select()
      .from(task)
      .where(eq(task.id, opened?.id ?? ""));
    expect(closed?.status).toBe("DONE");
    await expect(withdrawRequestAs(actor, created.id)).rejects.toThrow(t("T-1007"));
    // Retirada, se puede pedir otra del mismo tipo.
    await expect(
      createRequestAs(actor, "LEAVE", { reason: "De nuevo", until }),
    ).resolves.toBeTruthy();
    expect((await listRequestsByPerson(personId)).map((row) => row.status)).toEqual([
      "PENDING",
      "WITHDRAWN",
    ]);
  });

  it("rechazar exige motivo y aprobar una licencia mantiene acceso de consulta y avisa por correo", async () => {
    setMailTransportsForTests({ primary: fakeTransport(), overflow: null });
    const { personId, actor } = await activeMember("licencia@eafit.edu.co");
    const gh = await seedMember("gh@eafit.edu.co");
    const created = await createRequestAs(actor, "LEAVE", { reason: "Intercambio", until });
    await expect(
      decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "REJECTED" }),
    ).rejects.toThrow(t("T-1003"));
    await decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "APPROVED" });
    expect(await getMembershipRef(personId)).toMatchObject({ status: "ON_LEAVE" });
    const [licencia] = await getDb()
      .select({ leaveUntil: membership.leaveUntil })
      .from(membership)
      .where(eq(membership.personId, personId));
    expect(licencia?.leaveUntil).toBe(until);
    const [who] = await getDb().select().from(person).where(eq(person.id, personId));
    expect(who?.sessionsRevokedAt).toBeNull();
    const view = await getRequest(created.id);
    expect(view).toMatchObject({ status: "APPROVED", decidedById: gh });
    await expect(
      decideRequestAs({ personId: gh, ip: null }, created.id, {
        decision: "REJECTED",
        reason: "Tarde",
      }),
    ).rejects.toThrow(t("T-1007"));
    await drainOutbox();
    const mails = await getDb().select().from(message).where(eq(message.personId, personId));
    expect(mails).toHaveLength(1);
    expect(mails[0]?.subject).toBe(t("T-205", { tipo: tipoLicencia }).split(" · ")[0]);
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, personId));
    const summaries = timeline.map((item) => item.summary);
    expect(summaries).toContain(fillCopy(tList("T-1046")[6], { tipo: tipoLicencia }));
    expect(
      summaries.some((text) =>
        text.startsWith(
          fillCopy(tList("T-1046")[7], {
            tipo: tipoLicencia,
            estado: tList("T-876")[1].toLowerCase(),
            motivo: "",
          }).replace(/:\s*$/, ""),
        ),
      ),
    ).toBe(true);
    expect(await countPendingRequests()).toBe(0);
    expect((await listRequests({ status: "APPROVED", page: 1, pageSize: 10 })).total).toBe(1);
  });

  it("aprobar un retiro da de baja con los consentimientos de la persona; rechazar guarda el motivo", async () => {
    setMailTransportsForTests({ primary: fakeTransport(), overflow: null });
    const { personId, actor } = await activeMember("retiro@eafit.edu.co");
    const gh = await seedMember("gh@eafit.edu.co");
    const created = await createRequestAs(actor, "RESIGNATION", {
      reason: "Me gradúo",
      memorialConsent: true,
      contactConsent: true,
      personalEmail: "retiro@gmail.com",
    });
    await decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "APPROVED" });
    expect(await getMembershipRef(personId)).toMatchObject({ status: "INACTIVE" });
    const [who] = await getDb().select().from(person).where(eq(person.id, personId));
    expect(who).toMatchObject({ stage: "ALUMNI", personalEmail: "retiro@gmail.com" });
    expect(await hasLiveConsent(personId, "MEMORIAL")).toBe(true);
    const memorial = (await listConsents(personId)).find((state) => state.purpose === "MEMORIAL");
    expect(memorial?.live?.source).toBe("SELF");
    // Otra persona: rechazo con motivo.
    const other = await activeMember("otra@eafit.edu.co", "pixel");
    const second = await createRequestAs(other.actor, "LEAVE", { reason: "Trabajo", until });
    await decideRequestAs({ personId: gh, ip: null }, second.id, {
      decision: "REJECTED",
      reason: "Hablemos primero",
    });
    expect(await getRequest(second.id)).toMatchObject({
      status: "REJECTED",
      reason: "Hablemos primero",
    });
    expect(await getMembershipRef(other.personId)).toMatchObject({ status: "ACTIVE" });
    await drainOutbox();
    const mails = await getDb().select().from(message).where(eq(message.personId, other.personId));
    expect(mails).toHaveLength(1);
  });

  it("aprobar un cambio de comité escribe el término siguiente con cargos conservados y transferencia", async () => {
    const { termId, personId, actor, a3 } = await activeMember("cambio@eafit.edu.co");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const cigma = await seedCommittee("cigma", "CIGMA");
    await seedCommitteeMembership(personId, pixel, termId, "GENERAL");
    const gh = await seedMember("gh@eafit.edu.co");
    // Sin cambios o fuera de rango se rechaza al pedir.
    await expect(
      createRequestAs(actor, "TRANSFER", {
        reason: "Nada",
        leaveCommitteeIds: [],
        joinCommitteeIds: [],
      }),
    ).rejects.toThrow();
    await expect(
      createRequestAs(actor, "TRANSFER", {
        reason: "Todo",
        leaveCommitteeIds: [a3, pixel],
        joinCommitteeIds: [],
      }),
    ).rejects.toThrow(t("T-886", { min: 1, max: 3 }));
    const created = await createRequestAs(actor, "TRANSFER", {
      reason: "Quiero cambiar de aire",
      leaveCommitteeIds: [a3],
      joinCommitteeIds: [cigma],
    });
    expect((await getRequest(created.id))?.detail).toBe(
      t("T-1011", { deja: "A3", entra: "CIGMA" }),
    );
    await decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "APPROVED" });
    const next = await findTermByCode(nextTermCode(currentTermCode()));
    expect(next).not.toBeNull();
    const rows = await getDb()
      .select()
      .from(committeeMembership)
      .where(eq(committeeMembership.termId, next?.id ?? ""));
    expect(rows.map((row) => [row.committeeId, row.roleCode, row.transferredIn]).sort()).toEqual(
      [
        [pixel, "GENERAL", false],
        [cigma, "MIEMBRO", true],
      ].sort(),
    );
    // El término actual no cambia.
    expect(
      (await getMyMembership(personId)).committees.map((row) => row.committeeSlug).sort(),
    ).toEqual(["a3", "pixel"]);
  });

  // ADR-118 regla 10 (DT-204): antes la aprobación terminaba bien sin escribir nada y la solicitud
  // quedaba «aprobada» con la fecha vieja. La prórroga sigue sin existir (decisión abierta 35).
  it("aprobar la licencia de quien ya quedó en licencia responde el error y la solicitud sigue pendiente", async () => {
    const { personId, actor } = await activeMember("ya.en.licencia@eafit.edu.co");
    const gh = { personId: await seedMember("gh@eafit.edu.co"), ip: null };
    const created = await createRequestAs(actor, "LEAVE", { reason: "Intercambio", until });
    await changeMembershipStatusAs(gh, personId, {
      to: "ON_LEAVE",
      reason: "GH la registró a mano",
      leaveUntil: leaveUntilSoon(30),
    });

    await expect(decideRequestAs(gh, created.id, { decision: "APPROVED" })).rejects.toThrow(
      t("T-3245"),
    );

    expect((await getRequest(created.id))?.status).toBe("PENDING");
    const [fila] = await getDb()
      .select({ leaveUntil: membership.leaveUntil })
      .from(membership)
      .where(eq(membership.personId, personId));
    expect(fila?.leaveUntil).toBe(leaveUntilSoon(30));
  });

  // ADR-118 regla 11 roza DT-196: la solicitud pendiente sigue sobreviviendo a la baja (qué pasa con
  // ella es la primera pregunta de la decisión abierta 33), pero aprobarla ya no abre pertenencias.
  it("aprobar el cambio de comité de quien ya salió responde el error y la solicitud sigue pendiente (decisión abierta 33)", async () => {
    const { personId, actor } = await activeMember("ya.salio@eafit.edu.co");
    const cigma = await seedCommittee("cigma", "CIGMA");
    const gh = { personId: await seedMember("gh@eafit.edu.co"), ip: null };
    const created = await createRequestAs(actor, "TRANSFER", {
      reason: "Entro a CIGMA",
      leaveCommitteeIds: [],
      joinCommitteeIds: [cigma],
    });
    await endMembershipAs(gh, personId, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });

    await expect(decideRequestAs(gh, created.id, { decision: "APPROVED" })).rejects.toThrow(
      t("T-3246"),
    );

    expect((await getRequest(created.id))?.status).toBe("PENDING");
    const vivas = await getDb()
      .select({ id: committeeMembership.id })
      .from(committeeMembership)
      .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
    expect(vivas).toEqual([]);
  });

  /** Cargos vivos del término siguiente: [persona, comité, cargo, codirección]. */
  async function nextTermRoles() {
    const next = await findTermByCode(nextTermCode(currentTermCode()));
    const rows = await getDb()
      .select()
      .from(committeeRoleAssignment)
      .where(
        and(
          eq(committeeRoleAssignment.termId, next?.id ?? ""),
          isNull(committeeRoleAssignment.endedAt),
        ),
      );
    return rows.map((row) => [row.personId, row.committeeId, row.roleCode, row.coDirector]).sort();
  }

  async function approveLeaving(gh: string, personId: string, committeeId: string) {
    const created = await createRequestAs({ personId, ip: null }, "TRANSFER", {
      reason: "Dejo un comité",
      leaveCommitteeIds: [committeeId],
      joinCommitteeIds: [],
    });
    await decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "APPROVED" });
  }

  // ADR-118 regla 7 (DT-205): al término siguiente llegan los cargos reales, no el principal derivado.
  it("aprobar un cambio de comité conserva la codirección y deja aprobar también a la titular", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const gh = await seedMember("gh@eafit.edu.co");
    const titular = await seedVeteran("general@eafit.edu.co");
    const codirectora = await seedVeteran("codireccion@eafit.edu.co");
    await seedCommitteeMembership(titular, a3, termId, "GENERAL");
    await seedCommitteeMembership(titular, pixel, termId);
    await seedCommitteeMembership(codirectora, a3, termId, "GENERAL", { coDirector: true });
    await seedCommitteeMembership(codirectora, pixel, termId);

    await approveLeaving(gh, titular, pixel);
    await approveLeaving(gh, codirectora, pixel);

    expect(await nextTermRoles()).toEqual(
      [
        [titular, a3, "GENERAL", false],
        [codirectora, a3, "GENERAL", true],
      ].sort(),
    );
  });

  it("aprobar un cambio de comité lleva al término siguiente todos los cargos del comité que sigue", async () => {
    const termId = await seedTerm();
    const cigma = await seedCommittee("cigma", "CIGMA");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const gh = await seedMember("gh@eafit.edu.co");
    const personId = await seedVeteran("dos.cargos@eafit.edu.co");
    await setCommitteeMembershipsAs({ personId: gh, ip: null }, personId, termId, [
      {
        committeeId: cigma,
        roles: [
          { roleCode: "GENERAL", coDirector: false },
          { roleCode: "LOGISTICA", coDirector: true },
        ],
      },
      { committeeId: pixel },
    ]);

    await approveLeaving(gh, personId, pixel);

    expect(await nextTermRoles()).toEqual(
      [
        [personId, cigma, "GENERAL", false],
        [personId, cigma, "LOGISTICA", true],
      ].sort(),
    );
  });

  // Conducta de hoy, sin elegir: de qué término parte un segundo cambio es la decisión abierta 33.
  it("un segundo cambio aprobado en el mismo semestre parte del término vigente y deshace el primero (decisión abierta 33)", async () => {
    const { termId, personId, a3 } = await activeMember("dos.cambios@eafit.edu.co");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const cigma = await seedCommittee("cigma", "CIGMA");
    await seedCommitteeMembership(personId, pixel, termId);
    const gh = await seedMember("gh@eafit.edu.co");
    const primero = await createRequestAs({ personId, ip: null }, "TRANSFER", {
      reason: "Entro a CIGMA",
      leaveCommitteeIds: [a3],
      joinCommitteeIds: [cigma],
    });
    await decideRequestAs({ personId: gh, ip: null }, primero.id, { decision: "APPROVED" });

    await approveLeaving(gh, personId, pixel);

    const next = await findTermByCode(nextTermCode(currentTermCode()));
    const vivos = await getDb()
      .select({ committeeId: committeeMembership.committeeId })
      .from(committeeMembership)
      .where(
        and(eq(committeeMembership.termId, next?.id ?? ""), isNull(committeeMembership.leftAt)),
      );
    expect(vivos.map((row) => row.committeeId)).toEqual([a3]);
  });
});
