import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { balanceFor, decideCheckInAs, decideManyAs } from "@/modules/participation";
import { checkIn, occasion } from "@/modules/participation/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedCheckIn, seedMember, seedOccasion, seedTerm } from "../factories";
import { holdTransaction, whileHeld } from "../helpers/locks";
import { truncateAll } from "./db";

// DT-146 inciso (b), ADR-122 regla 1: la consola de una ocasión decide las asistencias de esa
// ocasión. El comando recibe la ocasión de la página y la compara con la asistencia que toma: la de
// otra ocasión responde como una que no existe (T-032) y no deja fila, puntos, auditoría ni evento.
// El lote («Aprobar todos») recibe la misma ocasión: una sola asistencia ajena en la lista lo tumba
// entero. Y ninguno de los dos toma nada de la otra ocasión: responde sin esperar a quien la retiene.

const POINTS = 10;

async function setup() {
  const termId = await seedTerm();
  const adminId = await seedMember("gh.alcance@eafit.edu.co");
  const personId = await seedMember("miembro.alcance@eafit.edu.co");
  const page = await seedOccasion(termId, {
    title: "La de la página",
    points: POINTS,
    approval: "MANUAL",
  });
  const other = await seedOccasion(termId, {
    title: "La otra",
    points: POINTS,
    approval: "MANUAL",
  });
  return { termId, admin: { personId: adminId, ip: null }, personId, page, other };
}

async function statusOf(checkInId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ status: checkIn.status })
    .from(checkIn)
    .where(eq(checkIn.id, checkInId));
  return row?.status;
}

/** Otra conexión retiene la ocasión y sus asistencias: quien las necesite hace cola. */
function holdOccasion(occasionId: string) {
  return holdTransaction(async (tx) => {
    await tx.select().from(occasion).where(eq(occasion.id, occasionId)).for("update");
    await tx.select().from(checkIn).where(eq(checkIn.occasionId, occasionId)).for("update");
  });
}

/** Lo que una decisión deja además de la fila: su auditoría y sus eventos. */
async function written(): Promise<{ audits: number; events: number }> {
  const db = getDb();
  return {
    audits: (await db.select({ id: auditLog.id }).from(auditLog)).length,
    events: (await db.select({ id: outbox.id }).from(outbox)).length,
  };
}

describe("decidir una asistencia desde la consola de su ocasión", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("aprobar desde una ocasión la asistencia pendiente de otra responde como si no existiera y no escribe nada", async () => {
    const f = await setup();
    const checkInId = await seedCheckIn(f.other.id, f.personId, "PENDING");
    const before = await written();

    await expect(
      decideCheckInAs(f.admin, {
        occasionId: f.page.id,
        checkInId,
        decision: "APPROVE",
        seenStatus: "PENDING",
      }),
    ).rejects.toThrow(t("T-032"));

    expect(await statusOf(checkInId)).toBe("PENDING");
    expect(await balanceFor(f.personId, f.termId)).toBe(0);
    expect(await written()).toEqual(before);
  });

  it("anular desde una ocasión la asistencia aprobada de otra tampoco entra", async () => {
    const f = await setup();
    const checkInId = await seedCheckIn(f.other.id, f.personId, "APPROVED");
    const before = await written();

    await expect(
      decideCheckInAs(f.admin, {
        occasionId: f.page.id,
        checkInId,
        decision: "CANCEL",
        reason: "Registro duplicado",
        seenStatus: "APPROVED",
      }),
    ).rejects.toThrow(t("T-032"));

    expect(await statusOf(checkInId)).toBe("APPROVED");
    expect(await written()).toEqual(before);
  });

  it("sin la ocasión de la página no hay decisión", async () => {
    const f = await setup();
    const checkInId = await seedCheckIn(f.other.id, f.personId, "PENDING");

    for (const occasionId of [undefined, null, ""]) {
      await expect(
        decideCheckInAs(f.admin, { occasionId, checkInId, decision: "APPROVE" } as never),
      ).rejects.toThrow(t("T-032"));
    }

    expect(await statusOf(checkInId)).toBe("PENDING");
    expect(await balanceFor(f.personId, f.termId)).toBe(0);
  });

  it("con la ocasión de la asistencia, la decisión entra", async () => {
    const f = await setup();
    const checkInId = await seedCheckIn(f.other.id, f.personId, "PENDING");

    await decideCheckInAs(f.admin, {
      occasionId: f.other.id,
      checkInId,
      decision: "APPROVE",
      seenStatus: "PENDING",
    });

    expect(await statusOf(checkInId)).toBe("APPROVED");
    expect(await balanceFor(f.personId, f.termId)).toBe(POINTS);
  });

  it("decidir desde una ocasión la asistencia de otra no toma nada de la otra: responde sin esperar a quien la retiene", async () => {
    const f = await setup();
    const checkInId = await seedCheckIn(f.other.id, f.personId, "PENDING");
    const held = await holdOccasion(f.other.id);

    expect(
      await whileHeld(held, () =>
        decideCheckInAs(f.admin, {
          occasionId: f.page.id,
          checkInId,
          decision: "APPROVE",
          seenStatus: "PENDING",
        }),
      ),
    ).toBe(t("T-032"));

    expect(await statusOf(checkInId)).toBe("PENDING");
  });

  it("«Aprobar todos» desde una ocasión con una asistencia de otra en la lista responde como si no existiera y no aprueba ninguna, ni la propia", async () => {
    const f = await setup();
    const ownerId = await seedMember("miembro.propio.alcance@eafit.edu.co");
    const own = await seedCheckIn(f.page.id, ownerId, "PENDING");
    const foreign = await seedCheckIn(f.other.id, f.personId, "PENDING");
    const before = await written();

    for (const list of [[foreign], [own, foreign]]) {
      await expect(decideManyAs(f.admin, f.page.id, list, "APPROVE")).rejects.toThrow(t("T-032"));
    }

    expect(await statusOf(own)).toBe("PENDING");
    expect(await statusOf(foreign)).toBe("PENDING");
    expect(await balanceFor(ownerId, f.termId)).toBe(0);
    expect(await balanceFor(f.personId, f.termId)).toBe(0);
    expect(await written()).toEqual(before);
  });

  it("«Aprobar todos» con una asistencia de otra ocasión no toma nada de la otra: responde sin esperar a quien la retiene", async () => {
    const f = await setup();
    const foreign = await seedCheckIn(f.other.id, f.personId, "PENDING");
    const held = await holdOccasion(f.other.id);

    expect(
      await whileHeld(held, () => decideManyAs(f.admin, f.page.id, [foreign], "APPROVE")),
    ).toBe(t("T-032"));

    expect(await statusOf(foreign)).toBe("PENDING");
  });

  it("sin la ocasión de la página «Aprobar todos» no decide nada, ni con la lista vacía", async () => {
    const f = await setup();
    const checkInId = await seedCheckIn(f.other.id, f.personId, "PENDING");

    for (const occasionId of [undefined, null, ""]) {
      for (const list of [[checkInId], []]) {
        await expect(decideManyAs(f.admin, occasionId as never, list, "APPROVE")).rejects.toThrow(
          t("T-032"),
        );
      }
    }

    expect(await statusOf(checkInId)).toBe("PENDING");
    expect(await balanceFor(f.personId, f.termId)).toBe(0);
  });

  it("«Aprobar todos» con la ocasión de sus asistencias aprueba y acredita", async () => {
    const f = await setup();
    const checkInId = await seedCheckIn(f.other.id, f.personId, "PENDING");

    expect(await decideManyAs(f.admin, f.other.id, [checkInId], "APPROVE")).toBe(1);

    expect(await statusOf(checkInId)).toBe("APPROVED");
    expect(await balanceFor(f.personId, f.termId)).toBe(POINTS);
  });
});
