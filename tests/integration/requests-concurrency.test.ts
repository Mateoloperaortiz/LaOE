import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { requestDecided, requestWithdrawn } from "@/domain-events/crm";
import { createRequestAs, decideRequestAs, getRequest, withdrawRequestAs } from "@/modules/crm";
import { request, task } from "@/modules/crm/schema";
import { getMembershipRef, setCommitteeMemberships, setMemberRolesAs } from "@/modules/people";
import { setMemberRoles } from "@/modules/people/domain/committee-direction";
import {
  committee,
  committeeMembership,
  committeeRoleAssignment,
  membership,
  membershipEvent,
} from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { findTermByCode, nextTermCode } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  firstThenSecond,
  holdCommand,
  holdTransaction,
  outcome,
  waitingOn,
  whileHeld,
} from "../helpers/locks";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
  seedVeteran,
} from "./factories";

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

// DT-316: aprobar un cambio de comité arma el término siguiente desde los comités vivos de la persona.
// Los leía antes de abrir su transacción, así que un cambio de sus comités que confirmara entre esa
// lectura y la escritura quedaba fuera del término siguiente. El candado de la solicitud no lo evita:
// serializa dos decisiones de la misma solicitud, no la aprobación con quien cambia los comités.
describe("aprobar un cambio de comité mientras otro comando cambia los comités de la persona", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("espera al cambio que va en vuelo y arma el término siguiente desde los comités ya cambiados", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cambio.en.vuelo@eafit.edu.co");
    const a3 = await seedCommittee("a3", "A3");
    const cigma = await seedCommittee("cigma", "CIGMA");
    const pixel = await seedCommittee("pixel", "PIXEL");
    await seedCommitteeMembership(personId, a3, termId);
    const { id: requestId } = await createRequestAs({ personId, ip: null }, "TRANSFER", {
      reason: "Quiero sumar un comité",
      leaveCommitteeIds: [],
      joinCommitteeIds: [cigma],
    });
    const gh = await reviewer("gh.cambio@eafit.edu.co");
    // GH le cambia A3 por PIXEL en el término vigente: queda escrito y sin confirmar.
    const held = await holdCommand(gh, (ctx) =>
      setCommitteeMemberships(ctx, personId, termId, [{ committeeId: pixel }]),
    );

    const approving = decideRequestAs(gh, requestId, { decision: "APPROVED" });
    void approving.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
    } finally {
      held.release();
      await held.done;
    }
    const [approved] = await Promise.allSettled([approving]);

    expect(approved && outcome(approved)).toBe("ok");
    const next = await findTermByCode(nextTermCode(currentTermCode()));
    const rows = await db()
      .select({
        committeeId: committeeMembership.committeeId,
        transferredIn: committeeMembership.transferredIn,
      })
      .from(committeeMembership)
      .where(
        and(
          eq(committeeMembership.personId, personId),
          eq(committeeMembership.termId, next?.id ?? ""),
          isNull(committeeMembership.leftAt),
        ),
      );
    const names = new Map([
      [a3, "A3"],
      [cigma, "CIGMA"],
      [pixel, "PIXEL"],
    ]);
    // PIXEL, que es donde quedó, y CIGMA, que es lo que pidió. A3 ya no es suyo.
    expect(rows.map((row) => [names.get(row.committeeId), row.transferredIn]).sort()).toEqual([
      ["CIGMA", true],
      ["PIXEL", false],
    ]);
  });
});

// DT-325: la dirección de un comité cambiaba los cargos de un miembro sin tomar la fila de su
// membresía, que es lo que toma la aprobación antes de leer los cargos que copia al término siguiente
// (ADR-121 regla 15). Un cambio de cargos ya escrito y sin confirmar no pasaba al término siguiente.
describe("aprobar un cambio de comité mientras la dirección cambia los cargos de la persona", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  const direction = { isAdmin: true, allCapabilities: true };
  const logistica = [{ roleCode: "LOGISTICA", coDirector: false }];

  async function transfer(email: string) {
    const termId = await seedTerm();
    const personId = await seedVeteran(email);
    const a3 = await seedCommittee("a3", "A3");
    const cigma = await seedCommittee("cigma", "CIGMA");
    await seedCommitteeMembership(personId, a3, termId);
    const { id: requestId } = await createRequestAs({ personId, ip: null }, "TRANSFER", {
      reason: "Quiero sumar un comité",
      leaveCommitteeIds: [],
      joinCommitteeIds: [cigma],
    });
    return { termId, personId, a3, cigma, requestId, scope: { committeeId: a3, termId } };
  }

  /** Los cargos vivos de la persona en A3, en el término vigente y en el siguiente. */
  async function rolesInA3(personId: string, a3: string, termId: string) {
    const next = await findTermByCode(nextTermCode(currentTermCode()));
    const rows = await db()
      .select({
        termId: committeeRoleAssignment.termId,
        roleCode: committeeRoleAssignment.roleCode,
      })
      .from(committeeRoleAssignment)
      .where(
        and(
          eq(committeeRoleAssignment.personId, personId),
          eq(committeeRoleAssignment.committeeId, a3),
          isNull(committeeRoleAssignment.endedAt),
        ),
      );
    const of = (id: string | undefined) =>
      rows.filter((row) => row.termId === id).map((row) => row.roleCode);
    return { current: of(termId), next: of(next?.id) };
  }

  it("si el cambio de cargos entra primero, la aprobación espera y lleva el cargo nuevo al término siguiente", async () => {
    const f = await transfer("cargo.en.vuelo@eafit.edu.co");
    const gh = await reviewer("gh.cargo@eafit.edu.co");
    // La dirección le da Logística en A3: queda escrito y sin confirmar.
    const held = await holdCommand(gh, (ctx) =>
      setMemberRoles(ctx, f.scope, direction, { personId: f.personId, roles: logistica }),
    );

    const how = await whileHeld(held, () =>
      decideRequestAs(gh, f.requestId, { decision: "APPROVED" }),
    );

    expect(await rolesInA3(f.personId, f.a3, f.termId)).toEqual({
      current: ["LOGISTICA"],
      next: ["LOGISTICA"],
    });
    expect(how).toBe("hizo cola");
    expect((await getRequest(f.requestId))?.status).toBe("APPROVED");
  });

  it("si la aprobación entra primero, el cambio de cargos espera y queda solo en el término vigente", async () => {
    const f = await transfer("aprobacion.en.vuelo@eafit.edu.co");
    const gh = await reviewer("gh.aprueba@eafit.edu.co");
    // La aprobación ya leyó los cargos y se detiene al escribir el comité que la persona pidió sumar.
    const held = await holdTransaction((tx) =>
      tx
        .select({ id: committee.id })
        .from(committee)
        .where(eq(committee.id, f.cigma))
        .for("update"),
    );

    const [approved, changed] = await firstThenSecond(
      held,
      () => decideRequestAs(gh, f.requestId, { decision: "APPROVED" }),
      () => setMemberRolesAs(gh, f.scope, direction, { personId: f.personId, roles: logistica }),
    );

    expect([outcome(approved), outcome(changed)]).toEqual(["ok", "ok"]);
    expect(await rolesInA3(f.personId, f.a3, f.termId)).toEqual({
      current: ["LOGISTICA"],
      next: [],
    });
  });
});
