import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { admitPersonAs, endMembershipAs } from "@/modules/people";
import { committeeMembership, membership, membershipEvent } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { holdTransaction, waitingOn } from "../helpers/locks";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import { seedCommittee, seedMember, seedPerson, seedTerm } from "./factories";

// DT-148: dar de alta toma la fila de la persona con candado antes de mirar si ya tiene membresía, y
// dar de baja toma el candado de la persona y la fila de su membresía antes de mirar su estado.
// Estas pruebas llaman a cada comando dos veces a la vez sobre la misma persona. Entre dos bajas, el
// consultivo de la persona y la fila de la membresía se cubren uno al otro: la tercera prueba deja a
// la fila sola, contra un escritor que no toma el consultivo.

const admin = { personId: null, ip: null };
const db = () => getDb();

function membershipsOf(personId: string) {
  return db().select().from(membership).where(eq(membership.personId, personId));
}

function eventsOf(membershipId: string, toStatus: "ACTIVE" | "INACTIVE") {
  return db()
    .select()
    .from(membershipEvent)
    .where(
      and(eq(membershipEvent.membershipId, membershipId), eq(membershipEvent.toStatus, toStatus)),
    );
}

function audits(action: string, entityId: string) {
  return db()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)));
}

describe("dar de alta y dar de baja a la misma persona a la vez", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("dos altas a la vez de la misma persona: vale una y la otra recibe que ya tiene membresía", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const personId = await seedPerson("alta.doble@eafit.edu.co", {
      firstName: "Ana",
      lastName: "Doble",
      stage: "APPLICANT",
    });
    const admit = () => admitPersonAs(admin, personId, { termId, committeeIds: [a3] });

    await warmPool();
    const outcomes = await Promise.allSettled([admit(), admit()]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejections = outcomes.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejections).toHaveLength(1);
    // La que esperó la fila de la persona ya vio la membresía: responde el dominio, no el índice único.
    expect(rejections[0]?.reason).toBeInstanceOf(DomainError);
    expect(rejections[0]?.reason).toMatchObject({ message: t("T-986", { nombre: "Ana Doble" }) });
    const memberships = await membershipsOf(personId);
    expect(memberships).toHaveLength(1);
    const membershipId = memberships[0]?.id ?? "";
    expect(await eventsOf(membershipId, "ACTIVE")).toHaveLength(1);
    expect(await audits("membership.created", membershipId)).toHaveLength(1);
    expect(
      await db()
        .select()
        .from(committeeMembership)
        .where(eq(committeeMembership.personId, personId)),
    ).toHaveLength(1);
  });

  it("dos bajas a la vez de la misma persona: la da de baja una sola y la otra responde que no hizo nada", async () => {
    const personId = await seedMember("baja.doble@eafit.edu.co");
    const [before] = await membershipsOf(personId);
    if (!before) throw new Error("sin membresía");
    const end = () =>
      endMembershipAs(admin, personId, {
        endReason: "OTHER",
        memorialConsent: false,
        contactConsent: false,
      });

    await warmPool();
    const results = await Promise.all([end(), end()]);

    // `true` es «la di de baja»; `false`, «ya lo estaba»: ninguna de las dos falla.
    expect(results.filter((ended) => ended)).toHaveLength(1);
    expect(results.filter((ended) => !ended)).toHaveLength(1);
    const [after] = await membershipsOf(personId);
    expect(after).toMatchObject({ status: "INACTIVE", walletEpoch: before.walletEpoch + 1 });
    expect(await eventsOf(before.id, "INACTIVE")).toHaveLength(1);
    expect(await audits("membership.ended", before.id)).toHaveLength(1);
  });

  it("una baja que encuentra la fila de la membresía tomada por otro escritor la espera y la vuelve a leer: responde que no hizo nada y no registra otra baja", async () => {
    const personId = await seedMember("baja.espera@eafit.edu.co");
    const [before] = await membershipsOf(personId);
    if (!before) throw new Error("sin membresía");
    // El otro escritor es sintético: cambia el estado sin tomar el consultivo de la persona, que hoy
    // toman todos los comandos que escriben esta fila (ADR-120 regla 3). Así lo único que hace
    // esperar a la baja es el `for update` de `lockMembership`.
    const held = await holdTransaction((tx) =>
      tx.update(membership).set({ status: "INACTIVE" }).where(eq(membership.id, before.id)),
    );
    const ending = endMembershipAs(admin, personId, {
      endReason: "OTHER",
      memorialConsent: false,
      contactConsent: false,
    });
    void ending.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
    } finally {
      held.release();
      await Promise.allSettled([held.done, ending]);
    }

    // Sin la fila bajo candado la baja lee «activa», espera en su `update` y da de baja encima.
    expect(await ending).toBe(false);
    const [after] = await membershipsOf(personId);
    expect(after).toMatchObject({
      status: "INACTIVE",
      walletEpoch: before.walletEpoch,
      endReason: null,
    });
    expect(await eventsOf(before.id, "INACTIVE")).toHaveLength(0);
    expect(await audits("membership.ended", before.id)).toHaveLength(0);
  });
});
