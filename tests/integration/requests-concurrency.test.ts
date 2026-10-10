import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { requestDecided, requestWithdrawn } from "@/domain-events/crm";
import { createRequestAs, decideRequestAs, getRequest, withdrawRequestAs } from "@/modules/crm";
import { request, task } from "@/modules/crm/schema";
import { getMembershipRef } from "@/modules/people";
import { membership, membershipEvent } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { firstThenSecond, holdTransaction, outcome } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedCommittee, seedCommitteeMembership, seedMember, seedTerm } from "./factories";

// DT-148: decidir y retirar una solicitud toman su fila con candado y recién después miran si sigue
// pendiente. Estas pruebas los llaman a la vez: aprobar un retiro da de baja, así que una segunda
// decisión que no esperara repetiría la auditoría y el correo, y un retiro de la solicitud que no
// esperara dejaría a la persona dada de baja con su solicitud «retirada».

const db = () => getDb();

async function resignation(email: string) {
  const termId = await seedTerm();
  const personId = await seedMember(email);
  const a3 = await seedCommittee("a3", "A3");
  await seedCommitteeMembership(personId, a3, termId);
  const actor = { personId, ip: null };
  const { id } = await createRequestAs(actor, "RESIGNATION", {
    reason: "Me gradúo",
    memorialConsent: true,
    contactConsent: true,
    personalEmail: "retiro@gmail.com",
  });
  return { personId, actor, requestId: id };
}

async function reviewer(email: string) {
  return { personId: await seedMember(email), ip: null };
}

function audits(action: string, entityId: string) {
  return db()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)));
}

function events(type: string) {
  return db().select().from(outbox).where(eq(outbox.eventType, type));
}

/** Cuántas veces quedó dada de baja la membresía de la persona. */
async function departures(personId: string) {
  return db()
    .select({ id: membershipEvent.id })
    .from(membershipEvent)
    .innerJoin(membership, eq(membership.id, membershipEvent.membershipId))
    .where(and(eq(membership.personId, personId), eq(membershipEvent.toStatus, "INACTIVE")));
}

describe("decidir y retirar la misma solicitud a la vez", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("dos aprobaciones a la vez del mismo retiro: vale una y la otra recibe que ya fue decidida", async () => {
    const { personId, requestId } = await resignation("retiro.doble@eafit.edu.co");
    const gh = await reviewer("gh.uno@eafit.edu.co");
    const otra = await reviewer("gh.dos@eafit.edu.co");

    const outcomes = await Promise.allSettled([
      decideRequestAs(gh, requestId, { decision: "APPROVED" }),
      decideRequestAs(otra, requestId, { decision: "APPROVED" }),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejections = outcomes.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejections).toHaveLength(1);
    // La que esperó el candado de la solicitud ya la encontró decidida.
    expect(rejections[0]?.reason).toBeInstanceOf(DomainError);
    expect(rejections[0]?.reason).toMatchObject({ message: t("T-1007") });
    // La baja, la auditoría y el aviso a la persona salen una sola vez.
    expect(await getMembershipRef(personId)).toMatchObject({ status: "INACTIVE" });
    expect(await departures(personId)).toHaveLength(1);
    expect(await audits("request.approved", requestId)).toHaveLength(1);
    expect(await events(requestDecided.type)).toHaveLength(1);
  });

  it("una aprobación que llega mientras la persona retira su solicitud: espera, recibe que ya no está pendiente y la membresía sigue", async () => {
    const { personId, actor, requestId } = await resignation("retiro.arrepentido@eafit.edu.co");
    const gh = await reviewer("gh.tarde@eafit.edu.co");
    const [row] = await db()
      .select({ taskId: request.taskId })
      .from(request)
      .where(eq(request.id, requestId));
    const taskId = row?.taskId;
    if (!taskId) throw new Error("la solicitud no abrió su tarea");
    // Retirar se detiene al cerrar la tarea de GH, ya con la fila de la solicitud tomada.
    const held = await holdTransaction((tx) =>
      tx.select({ id: task.id }).from(task).where(eq(task.id, taskId)).for("update"),
    );

    const [withdrawn, approved] = await firstThenSecond(
      held,
      () => withdrawRequestAs(actor, requestId),
      () => decideRequestAs(gh, requestId, { decision: "APPROVED" }),
    );

    expect(outcome(withdrawn)).toBe("ok");
    expect(outcome(approved)).toBe(t("T-1007"));
    expect((await getRequest(requestId))?.status).toBe("WITHDRAWN");
    expect(await getMembershipRef(personId)).toMatchObject({ status: "ACTIVE" });
    expect(await departures(personId)).toHaveLength(0);
    expect(await audits("request.approved", requestId)).toHaveLength(0);
    expect(await events(requestDecided.type)).toHaveLength(0);
  });

  it("un retiro de la solicitud que llega mientras GH la aprueba: espera, recibe que ya fue decidida y la baja queda", async () => {
    const { personId, actor, requestId } = await resignation("retiro.aprobado@eafit.edu.co");
    const gh = await reviewer("gh.primero@eafit.edu.co");
    // Aprobar se detiene al tomar la membresía que va a dar de baja, ya con la solicitud tomada.
    const held = await holdTransaction((tx) =>
      tx
        .select({ id: membership.id })
        .from(membership)
        .where(eq(membership.personId, personId))
        .for("update"),
    );

    const [approved, withdrawn] = await firstThenSecond(
      held,
      () => decideRequestAs(gh, requestId, { decision: "APPROVED" }),
      () => withdrawRequestAs(actor, requestId),
    );

    expect(outcome(approved)).toBe("ok");
    expect(outcome(withdrawn)).toBe(t("T-1007"));
    expect((await getRequest(requestId))?.status).toBe("APPROVED");
    expect(await getMembershipRef(personId)).toMatchObject({ status: "INACTIVE" });
    expect(await audits("request.withdrawn", requestId)).toHaveLength(0);
    expect(await events(requestWithdrawn.type)).toHaveLength(0);
  });
});
