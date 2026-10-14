import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { decideEventApprovalAs, requestEventApprovalAs } from "@/modules/finance";
import { createBudgetAs } from "@/modules/finance/domain/commands";
import { eventApproval } from "@/modules/finance/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedCommittee, seedMember } from "../factories";
import { truncateAll } from "./db";

// DT-146 inciso (b), ADR-122 regla 1: la Presidencia decide un aval desde la página de un
// presupuesto, que muestra los avales del comité de ese presupuesto. El comando recibe el presupuesto
// de la página y lo comprueba: el aval de otro comité responde como uno que no existe (T-032).

const admin = { personId: null, ip: null };

async function setup() {
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  const requester = { personId: await seedMember("fin.alcance@eafit.edu.co"), ip: null };
  const { id: a3Budget } = await createBudgetAs(admin, { committeeId: a3, year: 2026 });
  const { id: pixelBudget } = await createBudgetAs(admin, { committeeId: pixel, year: 2026 });
  const { id: pixelApproval } = await requestEventApprovalAs(requester, {
    committeeId: pixel,
    title: "Evento sintético",
    eventOn: "2026-11-20",
  });
  return { a3Budget, pixelBudget, pixelApproval };
}

async function approvalOf(id: string) {
  const [row] = await getDb()
    .select({ status: eventApproval.status, decidedAt: eventApproval.decidedAt })
    .from(eventApproval)
    .where(eq(eventApproval.id, id));
  return row;
}

async function audits(): Promise<number> {
  return (await getDb().select({ id: auditLog.id }).from(auditLog)).length;
}

describe("decidir un aval desde la página de un presupuesto", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("desde el presupuesto de un comité, el aval de otro responde como si no existiera y no escribe nada", async () => {
    const f = await setup();
    const before = await audits();

    for (const decision of ["APPROVED", "REJECTED"] as const) {
      await expect(
        decideEventApprovalAs(
          admin,
          f.pixelApproval,
          { decision, note: "Desde la página de otro comité" },
          { budgetId: f.a3Budget },
        ),
      ).rejects.toThrow(t("T-032"));
    }

    expect(await approvalOf(f.pixelApproval)).toEqual({ status: "PENDING", decidedAt: null });
    expect(await audits()).toBe(before);
  });

  it("sin presupuesto, o con uno que no existe, no hay decisión", async () => {
    const f = await setup();

    for (const scope of [undefined, null, {}, { budgetId: "" }, { budgetId: "no-existe-000" }]) {
      await expect(
        decideEventApprovalAs(
          admin,
          f.pixelApproval,
          { decision: "REJECTED", note: "Sin página" },
          scope as never,
        ),
      ).rejects.toThrow(t("T-032"));
    }

    expect(await approvalOf(f.pixelApproval)).toEqual({ status: "PENDING", decidedAt: null });
  });

  it("desde un presupuesto de su comité, la decisión entra", async () => {
    const f = await setup();

    await decideEventApprovalAs(
      admin,
      f.pixelApproval,
      { decision: "REJECTED", note: "No hay fecha" },
      { budgetId: f.pixelBudget },
    );

    expect((await approvalOf(f.pixelApproval))?.status).toBe("REJECTED");
  });
});
