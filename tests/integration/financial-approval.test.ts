import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  decideFinancialApprovalAs,
  getBudgetSummary,
  pendingFinancialApprovals,
  requestExtraordinaryAs,
  requestTransferAs,
} from "@/modules/finance";
import {
  approveBudgetAs,
  createBudgetAs,
  openBudgetAs,
  setBudgetLinesAs,
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
