import { createId } from "@paralleldrive/cuid2";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import {
  cancelReservationAs,
  createItemAs,
  decideLoanApprovalAs,
  listLoanApprovals,
  remainingLoanLines,
  requestLoanApprovalAs,
  reserveAs,
  setReservationGrantAs,
} from "@/modules/inventory";
import { listLogisticsSources } from "@/modules/people";
import { t } from "@/shared/copy";
import {
  seedAppointment,
  seedApprovedBudgetEvent,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

const now = new Date("2026-09-16T15:00:00Z");
const actor = (personId: string) => ({ personId, ip: null });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);
it("la misma autorización permite reservar solo el saldo y el rechazo no habilita materiales", async () => {
  const term = await seedTerm("2026-2");
  const vp = await seedMember("admin-bodega@eafit.edu.co");
  const pres = await seedMember("pres-bodega@eafit.edu.co");
  const director = await seedMember("logistica-bodega@eafit.edu.co");
  await seedAppointment(vp, term, "VP_ADMIN");
  await seedAppointment(pres, term, "PRESIDENT");
  const committee = await seedCommittee("almacen-prueba");
  await seedCommitteeMembership(director, committee, term, "LOGISTICA");
  const [source] = await listLogisticsSources(director);
  if (!source) throw new Error("Falta Logística");
  const ref = { sourceKind: source.kind, sourceId: source.id };
  await setReservationGrantAs(actor(vp), { ...ref, enabled: true });
  const item = await createItemAs(actor(vp), {
    name: "Mesa",
    mode: "QUANTITY",
    total: 10,
    box: "B",
    location: "Bodega",
  });
  const event = await seedApprovedBudgetEvent({
    committeeId: committee,
    budgetId: null,
    title: "Evento de prueba",
    eventOn: "2026-10-01",
    decidedAt: now,
  });
  const request = {
    ...ref,
    id: createId(),
    purpose: "COMMITTEE_EVENT" as const,
    eventApprovalId: event.id,
    eventStartsOn: "2026-10-01",
    eventEndsOn: "2026-10-02",
    title: "Evento de prueba",
    minutes: "Acta sintética de planeación",
    startsAt: "2026-09-30T15:00:00Z",
    lines: [{ itemId: item.id, quantity: 3 }],
  };
  const loan = await requestLoanApprovalAs(actor(director), request);
  expect(loan.endsAt.toISOString()).toBe("2026-10-08T05:00:00.000Z");
  expect((await requestLoanApprovalAs(actor(director), request)).id).toBe(loan.id);
  const confirmation = {
    ...ref,
    startsAt: loan.startsAt.toISOString(),
    endsAt: loan.endsAt.toISOString(),
    approvalId: loan.id,
    requestKey: createId(),
    lines: [{ itemId: item.id, quantity: 2 }],
  };
  await expect(reserveAs(actor(director), confirmation)).rejects.toThrow(t("T-5192"));
  await expect(
    decideLoanApprovalAs(actor(pres), loan.id, { decision: "APPROVED" }),
  ).rejects.toThrow();
  await decideLoanApprovalAs(actor(vp), loan.id, { decision: "APPROVED" });
  const reservation = await reserveAs(actor(director), confirmation);
  expect(await reserveAs(actor(director), confirmation)).toEqual(reservation);
  await expect(
    reserveAs(actor(director), { ...confirmation, requestKey: createId() }),
  ).rejects.toThrow(t("T-5192"));
  const [approved] = await listLoanApprovals({ requesterId: director });
  if (!approved) throw new Error("Falta el aval");
  expect((await remainingLoanLines(approved))[0]?.remaining).toBe(1);
  await cancelReservationAs(actor(director), { reservationId: reservation.id });
  expect((await remainingLoanLines(approved))[0]?.remaining).toBe(3);
  vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
  await expect(
    requestLoanApprovalAs(actor(director), { ...request, id: createId() }),
  ).rejects.toThrow(t("T-5191"));
  const late = await requestLoanApprovalAs(actor(director), {
    ...request,
    id: createId(),
    lateReason: "Cambió la fecha del evento",
  });
  await decideLoanApprovalAs(actor(vp), late.id, {
    decision: "REJECTED",
    note: "Material en reparación",
  });
  await expect(
    reserveAs(actor(director), { ...confirmation, approvalId: late.id }),
  ).rejects.toThrow(t("T-5192"));
});
