import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  decideFinancialApprovalAs,
  getBudgetSummary,
  pendingFinancialApprovals,
  recordPurchasePaymentAs,
  requestExtraordinaryAs,
  requestPurchaseAs,
  requestTransferAs,
} from "@/modules/finance";
import {
  approveBudgetAs,
  createBudgetAs,
  openBudgetAs,
  setBudgetLinesAs,
  submitPrerequestAs,
  updateBudgetAs,
} from "@/modules/finance/domain/commands";
import { outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import {
  seedAppointment,
  seedApprovedBudgetEvent,
  seedCommittee,
  seedMember,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

const now = new Date("2026-09-13T15:00:00Z");
async function fixture() {
  const termId = await seedTerm("2026-2");
  const committeeId = await seedCommittee("teatro", "Teatro");
  const actor = { personId: await seedMember("finanzas@eafit.edu.co"), ip: null };
  const vp = { personId: await seedMember("vpfin@eafit.edu.co"), ip: null };
  const president = { personId: await seedMember("presi@eafit.edu.co"), ip: null };
  await seedAppointment(president.personId, termId, "PRESIDENT");
  return { termId, committeeId, actor, vp, president };
}
describe("avales de la VP Financiera", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);
  it("hasta la compra de un centavo necesita el aval de la VP antes de registrar el pago", async () => {
    const f = await fixture();
    await seedAppointment(f.vp.personId, f.termId, "VP_FINANCE");
    const scope = { committeeId: f.committeeId };
    const { id: budgetId } = await createBudgetAs(f.actor, { ...scope, year: 2026 });
    await setBudgetLinesAs(f.actor, budgetId, { lines: [{ name: "Escenario", assigned: 50 }] });
    for (const approver of ["STUDENT_DEVELOPMENT", "VP_FINANCE"] as const)
      await approveBudgetAs(f.actor, budgetId, { approver, on: "2026-09-01" });
    await openBudgetAs(f.actor, budgetId);
    await submitPrerequestAs(f.actor, { budgetId, month: "2026-09" }, scope);
    const [line] = (await getBudgetSummary(budgetId))?.rawLines ?? [];
    if (!line) throw new Error("Falta el rubro");
    const input = {
      requestId: createId(),
      budgetId,
      lineId: line.id,
      plannedOn: "2026-09-13",
      amount: 0.01,
      description: "Cinta de muestra",
      supplier: "Proveedor de prueba",
    };
    const [req, resent] = await Promise.all([
      requestPurchaseAs(f.actor, input, scope, now),
      requestPurchaseAs(f.actor, input, scope, now),
    ]);
    expect(resent.id).toBe(req.id);
    const payment = { budgetId, purchaseId: req.id, paidOn: "2026-09-13" };
    await expect(recordPurchasePaymentAs(f.actor, payment, scope, now)).rejects.toThrow(
      t("T-5167"),
    );
    const other = await requestPurchaseAs(f.actor, { ...input, requestId: createId() }, scope, now);
    expect(other.id).not.toBe(req.id);
    await decideFinancialApprovalAs(
      f.vp,
      other.id,
      { decision: "REJECTED", note: "Se canceló la segunda compra" },
      now,
    );
    await expect(
      recordPurchasePaymentAs(f.actor, { ...payment, purchaseId: other.id }, scope, now),
    ).rejects.toThrow(t("T-5167"));
    await expect(
      decideFinancialApprovalAs(f.president, req.id, { decision: "APPROVED" }, now),
    ).rejects.toThrow();
    await decideFinancialApprovalAs(f.vp, req.id, { decision: "APPROVED" }, now);
    await expect(
      recordPurchasePaymentAs(f.actor, payment, { committeeId: "otro-comite" }, now),
    ).rejects.toThrow(t("T-032"));
    for (const paidOn of ["2026-09-12", "2026-09-14"])
      await expect(
        recordPurchasePaymentAs(f.actor, { ...payment, paidOn }, scope, now),
      ).rejects.toThrow(t("T-5168"));
    await expect(
      recordPurchasePaymentAs(
        f.actor,
        { ...payment, paidOn: "2026-10-01" },
        scope,
        new Date("2026-10-01T15:00:00Z"),
      ),
    ).rejects.toThrow(t("T-2292", { mes: "2026-10" }));
    expect((await getBudgetSummary(budgetId))?.expenses).toHaveLength(0);
    const [paid, retry] = await Promise.all([
      recordPurchasePaymentAs(f.actor, payment, scope, now),
      recordPurchasePaymentAs(f.actor, payment, scope, now),
    ]);
    expect(retry.id).toBe(paid.id);
    const summary = await getBudgetSummary(budgetId);
    expect(summary?.expenses).toMatchObject([
      { id: paid.id, amount: 0.01, supplier: input.supplier },
    ]);
    expect(summary?.totals.available).toBe(49.99);
    expect(summary?.financialApprovals.find((r) => r.id === req.id)).toMatchObject({
      expenseId: paid.id,
      decidedById: f.vp.personId,
    });
    expect(await requestPurchaseAs(f.actor, input, scope, now)).toEqual(req);
    await expect(requestPurchaseAs(f.actor, { ...input, amount: 3 }, scope, now)).rejects.toThrow(
      t("T-5169"),
    );
  });
  it("revalida el saldo bajo candado y aplica una sola vez el traslado que la VP aprueba", async () => {
    const f = await fixture();
    await seedAppointment(f.vp.personId, f.termId, "VP_FINANCE");
    const { id } = await createBudgetAs(f.actor, { committeeId: f.committeeId, year: 2026 });
    await setBudgetLinesAs(f.actor, id, {
      lines: [
        { name: "Luces", assigned: 100 },
        { name: "Sonido", assigned: 20 },
      ],
    });
    for (const approver of ["STUDENT_DEVELOPMENT", "VP_FINANCE"] as const)
      await approveBudgetAs(f.actor, id, { approver, on: "2026-09-01" });
    await openBudgetAs(f.actor, id);
    const summary = await getBudgetSummary(id);
    const [from, to] = summary?.rawLines ?? [];
    if (!from || !to) throw new Error("Faltan rubros");
    const event = await seedApprovedBudgetEvent({
      title: "Obra",
      committeeId: f.committeeId,
      budgetId: id,
      eventOn: "2026-09-30",
      decidedAt: now,
    });
    const ask = (reason: string) =>
      requestTransferAs(
        f.actor,
        {
          budgetId: id,
          fromLineId: from.id,
          toLineId: to.id,
          amount: 80,
          reason,
          approvalId: event.id,
        },
        { committeeId: f.committeeId },
        now,
      );
    const [a, again, b] = await Promise.all([
      ask("Primer ensayo"),
      ask("Primer ensayo"),
      ask("Segundo ensayo"),
    ]);
    expect(again.id).toBe(a.id);
    expect((await getBudgetSummary(id))?.transfers).toHaveLength(0);
    await expect(
      decideFinancialApprovalAs(f.president, a.id, { decision: "APPROVED" }, now),
    ).rejects.toThrow();
    const decisions = await Promise.allSettled(
      [a, b].map((req) => decideFinancialApprovalAs(f.vp, req.id, { decision: "APPROVED" }, now)),
    );
    expect(decisions.filter((d) => d.status === "fulfilled")).toHaveLength(1);
    const current = await getBudgetSummary(id);
    expect(current?.lines.map((l) => l.available)).toEqual([20, 100]);
    expect(current?.transfers).toHaveLength(1);
    const approved = current?.financialApprovals.find((r) => r.status === "APPROVED");
    expect(approved).toMatchObject({
      decidedAs: "HOLDER",
      decidedById: f.vp.personId,
      transferId: current?.transfers[0]?.id,
    });
    const pending = (await pendingFinancialApprovals())[0];
    if (!approved || !pending) throw new Error("Faltan decisiones");
    await expect(
      decideFinancialApprovalAs(f.vp, approved.id, { decision: "APPROVED" }, now),
    ).rejects.toThrow(t("T-2296"));
    await decideFinancialApprovalAs(
      f.vp,
      pending.id,
      { decision: "REJECTED", note: "Saldo insuficiente" },
      now,
    );
    const notices = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "notification.requested"));
    expect(notices.map((n) => n.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipients: [{ personId: f.vp.personId }] }),
        expect.objectContaining({ recipients: [{ personId: f.actor.personId }] }),
      ]),
    );
  });
  it("el extraordinario conserva las dos aprobaciones, el motivo y la propuesta de cada solicitud", async () => {
    const f = await fixture();
    const values = {
      committeeId: f.committeeId,
      year: 2026,
      kind: "EXTRAORDINARY" as const,
      title: "Función adicional",
      submittedOn: "2026-09-11",
    };
    const { id } = await createBudgetAs(f.actor, values);
    const ask = () => requestExtraordinaryAs(f.actor, id, { committeeId: f.committeeId }, now);
    await expect(ask()).rejects.toThrow(t("T-2291"));
    await setBudgetLinesAs(f.actor, id, { lines: [{ name: "Teatro", assigned: 500 }] });
    await expect(
      approveBudgetAs(f.actor, id, { approver: "VP_FINANCE", on: "2026-09-11" }),
    ).rejects.toThrow(t("T-5163"));
    const [a, b] = await Promise.all([ask(), ask()]);
    expect(b.id).toBe(a.id);
    await expect(
      decideFinancialApprovalAs(f.actor, a.id, { decision: "APPROVED" }, now),
    ).rejects.toThrow();
    await expect(
      updateBudgetAs(f.actor, id, { ...values, title: "Otra propuesta" }),
    ).rejects.toThrow(t("T-5161"));
    await expect(
      decideFinancialApprovalAs(f.president, a.id, { decision: "REJECTED" }, now),
    ).rejects.toThrow();
    await decideFinancialApprovalAs(
      f.president,
      a.id,
      { decision: "REJECTED", note: "Falta cotización" },
      now,
    );
    const again = await ask();
    expect(again.id).not.toBe(a.id);
    await decideFinancialApprovalAs(f.president, again.id, { decision: "APPROVED" }, now);
    await expect(openBudgetAs(f.actor, id)).rejects.toThrow(t("T-2290"));
    await approveBudgetAs(f.actor, id, { approver: "STUDENT_DEVELOPMENT", on: "2026-09-14" });
    await updateBudgetAs(f.actor, id, { ...values, title: "Segunda función" });
    expect((await getBudgetSummary(id))?.budget.vpFinanceApprovedOn).toBeNull();
    const last = await ask();
    await decideFinancialApprovalAs(f.president, last.id, { decision: "APPROVED" }, now);
    await openBudgetAs(f.actor, id);
    await expect(
      setBudgetLinesAs(f.actor, id, { lines: [{ name: "Teatro", assigned: 1500 }] }),
    ).rejects.toThrow(t("T-5164"));
    const summary = await getBudgetSummary(id);
    expect(summary?.budget).toMatchObject({
      status: "OPEN",
      vpFinanceApprovedOn: "2026-09-13",
      studentDevelopmentApprovedOn: "2026-09-14",
    });
    expect(summary?.financialApprovals.find((r) => r.id === again.id)).toMatchObject({
      decidedAs: "PRESIDENCY",
      proposal: { title: "Función adicional" },
    });
  });
});
