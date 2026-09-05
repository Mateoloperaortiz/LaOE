import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
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
import { getMembershipRef, getMyMembership, hasLiveConsent, listConsents } from "@/modules/people";
import { committeeMembership, person } from "@/modules/people/schema";
import { findTermByCode, nextTermCode } from "@/modules/terms";
import type { MailTransport } from "@/shared/adapters/mail";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedPerson,
  seedTerm,
} from "./factories";

// Solicitudes (ADR-031, ADR-037 regla 9): una pendiente por tipo, retirar, rechazar con motivo,
// aprobar ejecuta el comando de people en la misma transacción y la respuesta sale por correo.

const _admin = { personId: null, ip: null };

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

  it("solo un miembro activo, una pendiente por tipo, con tarea para GH y retirable", async () => {
    const { personId, actor } = await activeMember("miembro@eafit.edu.co");
    const prospect = await seedPerson("prospecto@gmail.com");
    await expect(
      createRequestAs({ personId: prospect, ip: null }, "LEAVE", { reason: "Viaje" }),
    ).rejects.toThrow(t("T-892"));
    await expect(createRequestAs(actor, "LEAVE", { reason: "x" })).rejects.toThrow();
    const created = await createRequestAs(actor, "LEAVE", {
      reason: "Intercambio",
      until: "2026-12-01",
    });
    const view = await getRequest(created.id);
    expect(view).toMatchObject({ status: "PENDING", kind: "LEAVE", personId });
    expect(view?.detail).toContain("Licencia hasta el");
    const [opened] = await getDb().select().from(task).where(eq(task.personId, personId));
    expect(opened).toMatchObject({
      kind: "REQUEST",
      status: "OPEN",
      title: t("T-1009", { nombre: "Persona Sintética", tipo: "licencia" }),
    });
    expect(view?.taskId).toBe(opened?.id);
    await expect(createRequestAs(actor, "LEAVE", { reason: "Otra vez" })).rejects.toThrow(
      t("T-891", { tipo: "licencia" }),
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
    await expect(createRequestAs(actor, "LEAVE", { reason: "De nuevo" })).resolves.toBeTruthy();
    expect((await listRequestsByPerson(personId)).map((row) => row.status)).toEqual([
      "PENDING",
      "WITHDRAWN",
    ]);
  });

  it("rechazar exige motivo y aprobar una licencia cambia el estado, revoca el acceso y avisa por correo", async () => {
    setMailTransportsForTests({ primary: fakeTransport(), overflow: null });
    const { personId, actor } = await activeMember("licencia@eafit.edu.co");
    const gh = await seedMember("gh@eafit.edu.co");
    const created = await createRequestAs(actor, "LEAVE", { reason: "Intercambio" });
    await expect(
      decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "REJECTED" }),
    ).rejects.toThrow(t("T-1003"));
    await decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "APPROVED" });
    expect(await getMembershipRef(personId)).toMatchObject({ status: "ON_LEAVE" });
    const [who] = await getDb().select().from(person).where(eq(person.id, personId));
    expect(who?.sessionsRevokedAt).not.toBeNull();
    const view = await getRequest(created.id);
    expect(view).toMatchObject({ status: "APPROVED", decidedById: gh });
    await expect(
      decideRequestAs({ personId: gh, ip: null }, created.id, {
        decision: "REJECTED",
        reason: "Tarde",
      }),
    ).rejects.toThrow(t("T-1007"));
    await drain(30);
    const mails = await getDb().select().from(message).where(eq(message.personId, personId));
    expect(mails).toHaveLength(1);
    expect(mails[0]?.subject).toBe("Respuesta a tu solicitud de licencia");
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, personId));
    const summaries = timeline.map((item) => item.summary);
    expect(summaries).toContain("Pidió licencia");
    expect(summaries.some((text) => text.startsWith("Solicitud de licencia aprobada"))).toBe(true);
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
    const second = await createRequestAs(other.actor, "LEAVE", { reason: "Trabajo" });
    await decideRequestAs({ personId: gh, ip: null }, second.id, {
      decision: "REJECTED",
      reason: "Hablemos primero",
    });
    expect(await getRequest(second.id)).toMatchObject({
      status: "REJECTED",
      reason: "Hablemos primero",
    });
    expect(await getMembershipRef(other.personId)).toMatchObject({ status: "ACTIVE" });
    await drain(30);
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
    expect((await getRequest(created.id))?.detail).toBe("Deja A3 · Entra a CIGMA");
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
});
