import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { balanceFor, decideCheckInAs } from "@/modules/participation";
import { checkIn } from "@/modules/participation/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedCheckIn, seedMember, seedOccasion, seedTerm } from "./factories";

// DT-146 inciso (b), ADR-122 regla 1: la consola de una ocasión decide las asistencias de esa
// ocasión. El comando recibe la ocasión de la página y la compara con la asistencia que toma: la de
// otra ocasión responde como una que no existe (T-032) y no deja fila, puntos, auditoría ni evento.

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
});
