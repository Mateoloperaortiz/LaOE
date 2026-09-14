import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { decideEventApproval, listEventApprovals } from "@/modules/finance/domain/approvals";
import { getBudgetSummary, listCommitteeBudgets } from "@/modules/finance/domain/budgets";
import {
  approveBudgetAs,
  closeBudgetAs,
  createBudgetAs,
  decideEventApprovalAs,
  openBudgetAs,
  recordExpenseAs,
  recordTransferAs,
  requestEventApprovalAs,
  sanctionBudgetAs,
  setBudgetLinesAs,
  submitPrerequestAs,
} from "@/modules/finance/domain/commands";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedCommittee, seedMember } from "./factories";

// Presupuesto del comité (ADR-059; ADR-060 regla 12): ordinario y extraordinario, aprobaciones antes
// de abrir, rubros, presolicitud mensual, gastos y traslados con disponible, aval de evento y sanción.

const admin = { personId: null, ip: null };

async function openBudgetFor(committeeId: string, year = 2026): Promise<string> {
  const { id } = await createBudgetAs(admin, { committeeId, year });
  await setBudgetLinesAs(admin, id, {
    lines: [
      { name: "Logística", assigned: 1000, sortOrder: 1 },
      { name: "Alimentación", assigned: 500, sortOrder: 2 },
    ],
  });
  await approveBudgetAs(admin, id, { approver: "STUDENT_DEVELOPMENT", on: "2026-01-09" });
  await approveBudgetAs(admin, id, { approver: "VP_FINANCE", on: "2026-01-10" });
  await openBudgetAs(admin, id);
  return id;
}

async function lineIds(budgetId: string): Promise<{ logistica: string; alimentacion: string }> {
  const summary = await getBudgetSummary(budgetId);
  const logistica = summary?.rawLines.find((line) => line.name === "Logística")?.id ?? "";
  const alimentacion = summary?.rawLines.find((line) => line.name === "Alimentación")?.id ?? "";
  return { logistica, alimentacion };
}

describe("presupuesto del comité", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    await truncateAll();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("un ordinario por comité y año, extraordinarios con actividad, y se abre solo aprobado y con rubros", async () => {
    const a3 = await seedCommittee("a3", "A3");
    const { id } = await createBudgetAs(admin, { committeeId: a3, year: 2026 });
    await expect(createBudgetAs(admin, { committeeId: a3, year: 2026 })).rejects.toThrow(
      t("T-2287", { año: 2026 }),
    );
    await expect(
      createBudgetAs(admin, { committeeId: a3, year: 2026, kind: "EXTRAORDINARY" }),
    ).rejects.toThrow();
    await createBudgetAs(admin, {
      committeeId: a3,
      year: 2026,
      kind: "EXTRAORDINARY",
      title: "Festival de cine",
    });
    expect((await listCommitteeBudgets(a3, 2026)).map((row) => row.kind)).toEqual([
      "ORDINARY",
      "EXTRAORDINARY",
    ]);

    await expect(openBudgetAs(admin, id)).rejects.toThrow(t("T-2290"));
    await approveBudgetAs(admin, id, { approver: "STUDENT_DEVELOPMENT", on: "2026-01-09" });
    await approveBudgetAs(admin, id, { approver: "VP_FINANCE", on: "2026-01-10" });
    await expect(openBudgetAs(admin, id)).rejects.toThrow(t("T-2291"));
    await setBudgetLinesAs(admin, id, { lines: [{ name: "Logística", assigned: 1000 }] });
    await openBudgetAs(admin, id);
    expect((await getBudgetSummary(id))?.budget.status).toBe("OPEN");
  });

  it("presolicitud del mes, gasto y traslado sin superar el disponible; nada se borra con movimientos", async () => {
    const a3 = await seedCommittee("a3", "A3");
    const financiero = await seedMember("fin@eafit.edu.co");
    const actor = { personId: financiero, ip: null };
    const id = await openBudgetFor(a3);
    const { logistica, alimentacion } = await lineIds(id);

    // Sin presolicitud del mes no hay acceso a los recursos (Est. art. 38.3).
    await expect(
      recordExpenseAs(actor, {
        budgetId: id,
        lineId: logistica,
        spentOn: "2026-09-13",
        amount: 100,
        description: "Carpas",
      }),
    ).rejects.toThrow(t("T-2292", { mes: "2026-09" }));
    await submitPrerequestAs(actor, { budgetId: id, month: "2026-09" });
    await expect(submitPrerequestAs(actor, { budgetId: id, month: "2026-09" })).rejects.toThrow(
      t("T-2297", { mes: "2026-09" }),
    );
    await recordExpenseAs(actor, {
      budgetId: id,
      lineId: logistica,
      spentOn: "2026-09-13",
      amount: 100,
      description: "Carpas",
      supplier: "Carpas del Valle",
    });
    await expect(
      recordExpenseAs(actor, {
        budgetId: id,
        lineId: logistica,
        spentOn: "2026-09-14",
        amount: 901,
        description: "Demasiado",
      }),
    ).rejects.toThrow(/No hay disponible en Logística/);
    await expect(
      recordTransferAs(actor, {
        budgetId: id,
        fromLineId: logistica,
        toLineId: logistica,
        amount: 10,
        reason: "Mismo rubro",
      }),
    ).rejects.toThrow(t("T-2293"));
    const transfer = {
      budgetId: id,
      fromLineId: logistica,
      toLineId: alimentacion,
      amount: 400,
      reason: "Sobró logística",
    };
    await expect(recordTransferAs(actor, transfer)).rejects.toThrow(t("T-2294"));
    const { id: approvedId } = await requestEventApprovalAs(actor, {
      committeeId: a3,
      budgetId: id,
      title: "Evento sintético",
      eventOn: "2026-11-20",
    });
    await decideEventApprovalAs(admin, approvedId, { decision: "APPROVED" });
    await recordTransferAs(actor, {
      budgetId: id,
      fromLineId: logistica,
      toLineId: alimentacion,
      amount: 400,
      approvalId: approvedId,
      reason: "Sobró logística",
    });
    const summary = await getBudgetSummary(id);
    expect(summary?.lines.map((line) => [line.name, line.available])).toEqual([
      ["Logística", 500],
      ["Alimentación", 900],
    ]);
    expect(summary?.totals).toEqual({ assigned: 1500, spent: 100, available: 1400 });
    expect(summary?.expenses[0]).toMatchObject({
      supplier: "Carpas del Valle",
      lineName: "Logística",
    });

    // Un rubro con movimientos no se borra.
    await expect(
      setBudgetLinesAs(admin, id, {
        lines: [{ id: logistica, name: "Logística", assigned: 1000 }],
      }),
    ).rejects.toThrow(t("T-2289", { rubro: "Alimentación" }));

    // La sanción del 10 % ajusta lo asignado (Regl. art. 66) y cerrar bloquea los movimientos.
    await sanctionBudgetAs(admin, id, { percent: 10, reason: "Presentado tarde" });
    expect((await getBudgetSummary(id))?.totals.assigned).toBe(1350);
    await closeBudgetAs(admin, id);
    await expect(submitPrerequestAs(actor, { budgetId: id, month: "2026-10" })).rejects.toThrow(
      t("T-2204", { año: 2026 }),
    );
    const acciones = (await getDb().select().from(auditLog).where(eq(auditLog.entityId, id))).map(
      (row) => row.action,
    );
    expect(acciones).toEqual(
      expect.arrayContaining([
        "budget.created",
        "budget.lines-set",
        "budget.approved",
        "budget.opened",
        "budget.prerequest",
        "budget.expense",
        "budget.transfer",
        "budget.sanctioned",
        "budget.closed",
      ]),
    );
  });

  it("el aval de evento lo decide la Presidencia una vez y liga gastos y traslados antes del evento", async () => {
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const financiero = await seedMember("fin@eafit.edu.co");
    const actor = { personId: financiero, ip: null };
    const id = await openBudgetFor(a3);
    const { logistica, alimentacion } = await lineIds(id);
    await submitPrerequestAs(actor, { budgetId: id, month: "2026-09" });

    await expect(submitPrerequestAs(actor, { budgetId: id, month: "2026-13" })).rejects.toThrow();
    await expect(submitPrerequestAs(actor, { budgetId: id, month: "2027-01" })).rejects.toThrow(
      t("T-2329", { año: 2026 }),
    );
    await expect(
      requestEventApprovalAs(actor, {
        committeeId: pixel,
        budgetId: id,
        title: "Ajeno",
        eventOn: "2026-11-20",
      }),
    ).rejects.toThrow(t("T-2294"));
    await expect(
      requestEventApprovalAs(actor, {
        committeeId: a3,
        budgetId: id,
        title: "Otro año",
        eventOn: "2027-11-20",
      }),
    ).rejects.toThrow(t("T-2329", { año: 2026 }));
    const { id: aval } = await requestEventApprovalAs(actor, {
      committeeId: a3,
      budgetId: id,
      title: "Noche de talentos",
      eventOn: "2026-11-20",
    });
    const { id: pasado } = await requestEventApprovalAs(actor, {
      committeeId: a3,
      title: "Ya pasó",
      eventOn: "2026-01-15",
    });
    const { id: ajeno } = await requestEventApprovalAs(actor, {
      committeeId: pixel,
      title: "De otro comité",
      eventOn: "2026-11-20",
    });
    // Pendiente no sirve como aval.
    await expect(
      recordExpenseAs(actor, {
        budgetId: id,
        lineId: logistica,
        spentOn: "2026-09-13",
        amount: 50,
        description: "Sonido",
        approvalId: aval,
      }),
    ).rejects.toThrow(t("T-2294"));
    await expect(decideEventApprovalAs(admin, pasado, { decision: "APPROVED" })).rejects.toThrow(
      t("T-2330"),
    );
    // Un aval histórico se aprobó antes de su evento; hoy ya no permite traslados.
    await runCommand(admin, (ctx) =>
      decideEventApproval(ctx, pasado, { decision: "APPROVED" }, new Date("2026-01-10T12:00:00Z")),
    );
    for (const approvalId of [aval, ajeno]) {
      await decideEventApprovalAs(admin, approvalId, { decision: "APPROVED", note: "Adelante" });
    }
    await expect(
      decideEventApprovalAs(admin, aval, { decision: "REJECTED", note: "Tarde" }),
    ).rejects.toThrow(t("T-2296"));
    await expect(
      recordExpenseAs(actor, {
        budgetId: id,
        lineId: logistica,
        spentOn: "2026-09-12",
        amount: 50,
        description: "Anterior al aval",
        approvalId: aval,
      }),
    ).rejects.toThrow(t("T-2330"));
    await recordExpenseAs(actor, {
      budgetId: id,
      lineId: logistica,
      spentOn: "2026-09-13",
      amount: 50,
      description: "Sonido",
      approvalId: aval,
    });
    await expect(
      recordExpenseAs(actor, {
        budgetId: id,
        lineId: logistica,
        spentOn: "2026-09-13",
        amount: 50,
        description: "Ajeno",
        approvalId: ajeno,
      }),
    ).rejects.toThrow(t("T-2294"));
    // Las reasignaciones se presentan antes del evento (Est. art. 38 par. 2).
    await expect(
      recordTransferAs(actor, {
        budgetId: id,
        fromLineId: logistica,
        toLineId: alimentacion,
        amount: 10,
        reason: "Tarde",
        approvalId: pasado,
      }),
    ).rejects.toThrow(/antes del evento/);
    await recordTransferAs(actor, {
      budgetId: id,
      fromLineId: logistica,
      toLineId: alimentacion,
      amount: 10,
      reason: "A tiempo",
      approvalId: aval,
    });
    const summary = await getBudgetSummary(id);
    expect(summary?.expenses[0]?.approvalTitle).toBe("Noche de talentos");
    expect(summary?.transfers[0]?.approvalTitle).toBe("Noche de talentos");
    expect(
      (await listEventApprovals({ committeeId: a3, status: "APPROVED" })).map((r) => r.title),
    ).toEqual(["Ya pasó", "Noche de talentos"]);
    const error = await decideEventApprovalAs(admin, "no-existe-000", {
      decision: "APPROVED",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
  });
});
