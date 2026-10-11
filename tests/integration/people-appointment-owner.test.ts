import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { removeAppointmentAs } from "@/modules/people";
import { appointment } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedAppointment, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// DT-146 inciso (b), ADR-122 regla 1: un cargo se quita desde la ficha de su persona o desde la mesa
// de su edición. El comando recibe ese dueño y lo comprueba: el cargo de otra persona, o uno que no
// es de esa mesa, responde como uno que no existe (T-032) y sigue en su sitio.
// El camino que sí quita está en consents.test.ts (la persona) y macroevent-board.test.ts (la mesa).

const admin = { personId: null, ip: null };

async function setup() {
  const termId = await seedTerm();
  const pageId = await seedMember("ficha.alcance@eafit.edu.co");
  const presidentId = await seedMember("presidencia.alcance@eafit.edu.co");
  const appointmentId = await seedAppointment(presidentId, termId, "PRESIDENT");
  return { pageId, presidentId, appointmentId };
}

async function stillThere(id: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: appointment.id })
    .from(appointment)
    .where(eq(appointment.id, id));
  return rows.length === 1;
}

async function written(): Promise<{ audits: number; events: number }> {
  const db = getDb();
  return {
    audits: (await db.select({ id: auditLog.id }).from(auditLog)).length,
    events: (await db.select({ id: outbox.id }).from(outbox)).length,
  };
}

describe("quitar un cargo desde la página de su dueño", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("desde la ficha de una persona, el cargo de otra responde como si no existiera y no se borra", async () => {
    const f = await setup();
    const before = await written();

    await expect(
      removeAppointmentAs(admin, f.appointmentId, { personId: f.pageId }),
    ).rejects.toThrow(t("T-032"));

    expect(await stillThere(f.appointmentId)).toBe(true);
    expect(await written()).toEqual(before);
  });

  it("desde la mesa de una edición, un cargo que no es de esa mesa tampoco se borra", async () => {
    const f = await setup();
    const before = await written();

    await expect(
      removeAppointmentAs(admin, f.appointmentId, { editionId: "edicion-de-otra-mesa" }),
    ).rejects.toThrow(t("T-032"));

    expect(await stillThere(f.appointmentId)).toBe(true);
    expect(await written()).toEqual(before);
  });

  it("sin dueño, o con uno que no se reconoce, no se quita", async () => {
    const f = await setup();
    const unrecognized = [
      undefined,
      null,
      {},
      { personId: "" },
      { committeeId: "a3" },
      // Los dos a la vez no son ninguno: la página es una ficha o una mesa.
      { personId: f.presidentId, editionId: "edicion-de-otra-mesa" },
    ];

    for (const owner of unrecognized) {
      await expect(removeAppointmentAs(admin, f.appointmentId, owner as never)).rejects.toThrow(
        t("T-032"),
      );
    }

    expect(await stillThere(f.appointmentId)).toBe(true);
  });

  it("desde la ficha de su persona, el cargo se quita", async () => {
    const f = await setup();

    await removeAppointmentAs(admin, f.appointmentId, { personId: f.presidentId });

    expect(await stillThere(f.appointmentId)).toBe(false);
  });
});
