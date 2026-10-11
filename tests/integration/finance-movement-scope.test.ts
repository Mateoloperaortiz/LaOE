import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { getBudgetSummary } from "@/modules/finance";
import {
  approveBudgetAs,
  createBudgetAs,
  decideEventApprovalAs,
  openBudgetAs,
  recordExpenseAs,
  recordTransferAs,
  requestEventApprovalAs,
  setBudgetLinesAs,
  submitPrerequestAs,
} from "@/modules/finance/domain/commands";
import {
  budgetExpense,
  budgetPrerequest,
  budgetTransfer,
  committeeBudget,
} from "@/modules/finance/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { holdTransaction, whileHeld } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedCommittee, seedMember } from "./factories";

// DT-146 inciso (c), ADR-122 regla 1: quien tiene FINANCE lo tiene en un comité, y desde la página
// de finanzas de ese comité registra la presolicitud, el gasto y el traslado. Los tres comandos
// reciben el comité de la página y lo comprueban: el presupuesto de otro comité responde como uno que
// no existe (T-032), no se toma y no deja movimiento ni auditoría.

const admin = { personId: null, ip: null };

async function openBudgetFor(committeeId: string) {
  const { id } = await createBudgetAs(admin, { committeeId, year: 2026 });
  await setBudgetLinesAs(admin, id, {
    lines: [
      { name: "Logística", assigned: 1000, sortOrder: 1 },
      { name: "Alimentación", assigned: 500, sortOrder: 2 },
    ],
  });
  await approveBudgetAs(admin, id, { approver: "STUDENT_DEVELOPMENT", on: "2026-01-09" });
  await approveBudgetAs(admin, id, { approver: "VP_FINANCE", on: "2026-01-10" });
  await openBudgetAs(admin, id);
  const lines = (await getBudgetSummary(id))?.rawLines ?? [];
  return {
    id,
    logistica: lines.find((line) => line.name === "Logística")?.id ?? "",
    alimentacion: lines.find((line) => line.name === "Alimentación")?.id ?? "",
  };
}

/**
 * Dos comités con su presupuesto abierto. El de PIXEL ya tiene la presolicitud del mes y un aval
 * aprobado: lo único que le falta a un movimiento sobre él para entrar es venir de su página.
 */
async function setup() {
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  const actor = { personId: await seedMember("fin.movimientos@eafit.edu.co"), ip: null };
  const own = await openBudgetFor(a3);
  const other = await openBudgetFor(pixel);
  const { id: approvalId } = await requestEventApprovalAs(actor, {
    committeeId: pixel,
    budgetId: other.id,
    title: "Evento sintético",
    eventOn: "2026-11-20",
  });
  await decideEventApprovalAs(admin, approvalId, { decision: "APPROVED" }, { budgetId: other.id });
  await submitPrerequestAs(actor, { budgetId: other.id, month: "2026-09" }, { committeeId: pixel });
  return { a3, pixel, actor, own, other, approvalId };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

/** Los tres movimientos sobre el presupuesto de PIXEL, cada uno válido si viniera de su página. */
function movementsOn(f: Fixture, scope: never) {
  return [
    () => submitPrerequestAs(f.actor, { budgetId: f.other.id, month: "2026-10" }, scope),
    () =>
      recordExpenseAs(
        f.actor,
        {
          budgetId: f.other.id,
          lineId: f.other.logistica,
          spentOn: "2026-09-13",
          amount: 100,
          description: "Carpas",
        },
        scope,
      ),
    () =>
      recordTransferAs(
        f.actor,
        {
          budgetId: f.other.id,
          fromLineId: f.other.logistica,
          toLineId: f.other.alimentacion,
          amount: 100,
          reason: "Sobró logística",
          approvalId: f.approvalId,
        },
        scope,
      ),
  ];
}

/** Lo que hay registrado en total: presolicitudes, gastos, traslados y auditoría. */
async function written() {
  const db = getDb();
  return {
    prerequests: (await db.select({ id: budgetPrerequest.id }).from(budgetPrerequest)).length,
    expenses: (await db.select({ id: budgetExpense.id }).from(budgetExpense)).length,
    transfers: (await db.select({ id: budgetTransfer.id }).from(budgetTransfer)).length,
    audits: (await db.select({ id: auditLog.id }).from(auditLog)).length,
  };
}

describe("los movimientos de un presupuesto desde la página de finanzas de su comité", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    await truncateAll();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("desde la página de un comité, la presolicitud, el gasto y el traslado sobre el presupuesto de otro responden como si no existiera y no escriben nada", async () => {
    const f = await setup();
    const before = await written();

    for (const movement of movementsOn(f, { committeeId: f.a3 } as never)) {
      await expect(movement()).rejects.toThrow(t("T-032"));
    }

    expect(await written()).toEqual(before);
  });

  it("sin el comité de la página, o con uno que no existe, ninguno de los tres registra nada", async () => {
    const f = await setup();
    const before = await written();

    for (const scope of [undefined, null, {}, { committeeId: "" }, { committeeId: "no-existe" }]) {
      for (const movement of movementsOn(f, scope as never)) {
        await expect(movement()).rejects.toThrow(t("T-032"));
      }
    }

    expect(await written()).toEqual(before);
  });

  it("un movimiento sobre el presupuesto de otro comité no lo toma: responde sin esperar a quien lo retiene", async () => {
    const f = await setup();

    for (const movement of movementsOn(f, { committeeId: f.a3 } as never)) {
      const held = await holdTransaction((tx) =>
        tx.select().from(committeeBudget).where(eq(committeeBudget.id, f.other.id)).for("update"),
      );
      expect(await whileHeld(held, movement)).toBe(t("T-032"));
    }
  });

  it("desde la página de su comité, los tres entran", async () => {
    const f = await setup();
    const before = await written();

    for (const movement of movementsOn(f, { committeeId: f.pixel } as never)) {
      await movement();
    }

    expect(await written()).toEqual({
      prerequests: before.prerequests + 1,
      expenses: before.expenses + 1,
      transfers: before.transfers + 1,
      audits: before.audits + 3,
    });
  });
});
