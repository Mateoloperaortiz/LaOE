import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { notificationRequested } from "@/domain-events/comms";
import { decideEventApprovalAs, requestEventApprovalAs } from "@/modules/finance";
import { eventApproval } from "@/modules/finance/schema";
import { APPOINTMENT_KINDS } from "@/modules/people";
import { auditLog, outbox } from "@/modules/system/schema";
import { t, tLabels } from "@/shared/copy";
import { seedAppointment, seedCommittee, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// ADR-195 (que reemplaza la ADR-122 regla 1 para el aval de evento): el aval lo decide la Presidencia
// por su cargo, de cualquier comité y sin pasar por la página de un presupuesto. Ni ADMIN ni otra VP lo
// deciden. Rechazar exige el motivo. A la Presidencia le llega un aviso cuando se pide, y a quien lo
// pidió, otro cuando se decide.

const admin = { personId: null, ip: null };
const presidencia = tLabels("T-444", APPOINTMENT_KINDS).PRESIDENT;

async function setup(withPresident = true) {
  const termId = await seedTerm();
  const pixel = await seedCommittee("pixel", "PIXEL");
  const requesterId = await seedMember("fin.alcance@eafit.edu.co");
  const presidentId = await seedMember("presidencia.avales@eafit.edu.co");
  if (withPresident) await seedAppointment(presidentId, termId, "PRESIDENT");
  const financeId = await seedMember("financiera.avales@eafit.edu.co");
  await seedAppointment(financeId, termId, "VP_FINANCE");
  const { id: aval } = await requestEventApprovalAs(
    { personId: requesterId, ip: null },
    {
      committeeId: pixel,
      title: "Evento sintético",
      eventOn: "2099-11-20",
      riskLevel: "GREEN" as const,
      riskJustification: "Actividad de rutina, sin publicaciones sensibles",
    },
  );
  return { termId, pixel, requesterId, presidentId, financeId, aval };
}

async function approvalOf(id: string) {
  const [row] = await getDb()
    .select({
      status: eventApproval.status,
      decidedById: eventApproval.decidedById,
      decisionNote: eventApproval.decisionNote,
    })
    .from(eventApproval)
    .where(eq(eventApproval.id, id));
  return row;
}

async function audits(): Promise<number> {
  return (await getDb().select({ id: auditLog.id }).from(auditLog)).length;
}

async function avisos() {
  return (
    await getDb().select().from(outbox).where(eq(outbox.eventType, notificationRequested.type))
  ).map(
    (row) =>
      row.payload as { dedupeKey: string; body: string; recipients: Array<{ personId: string }> },
  );
}

describe("quién decide el aval de evento", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("ni ADMIN, ni otra VP, ni quien lo pidió lo deciden: lo decide la Presidencia, y no escribe nada", async () => {
    const f = await setup();
    const before = await audits();

    for (const actor of [
      admin,
      { personId: f.financeId, ip: null },
      { personId: f.requesterId, ip: null },
    ]) {
      for (const decision of ["APPROVED", "REJECTED"] as const) {
        await expect(
          decideEventApprovalAs(actor, f.aval, { decision, note: "Sin el cargo" }),
        ).rejects.toThrow(t("T-5088", { cargo: presidencia }));
      }
    }

    expect(await approvalOf(f.aval)).toMatchObject({ status: "PENDING", decidedById: null });
    expect(await audits()).toBe(before);
  });

  it("la Presidencia decide el aval de cualquier comité, sin pasar por su presupuesto", async () => {
    const f = await setup();

    await decideEventApprovalAs({ personId: f.presidentId, ip: null }, f.aval, {
      decision: "APPROVED",
    });

    expect(await approvalOf(f.aval)).toMatchObject({
      status: "APPROVED",
      decidedById: f.presidentId,
    });
  });

  it("rechazar exige el motivo", async () => {
    const f = await setup();
    const presidenta = { personId: f.presidentId, ip: null };

    await expect(
      decideEventApprovalAs(presidenta, f.aval, { decision: "REJECTED", note: " " }),
    ).rejects.toThrow(t("T-5087"));
    expect((await approvalOf(f.aval))?.status).toBe("PENDING");

    await decideEventApprovalAs(presidenta, f.aval, {
      decision: "REJECTED",
      note: "El evento se cruza con la asamblea",
    });
    expect(await approvalOf(f.aval)).toMatchObject({
      status: "REJECTED",
      decisionNote: "El evento se cruza con la asamblea",
    });
  });

  it("avisa a la Presidencia cuando se pide y a quien lo pidió cuando se decide, con el motivo", async () => {
    const f = await setup();

    expect(await avisos()).toEqual([
      expect.objectContaining({
        dedupeKey: `aval-evento:${f.aval}`,
        recipients: [expect.objectContaining({ personId: f.presidentId })],
      }),
    ]);

    await decideEventApprovalAs({ personId: f.presidentId, ip: null }, f.aval, {
      decision: "REJECTED",
      note: "Falta el plan de seguridad",
    });

    const decidido = (await avisos()).find(
      (row) => row.dedupeKey === `aval-evento-decidido:${f.aval}`,
    );
    expect(decidido?.recipients).toEqual([expect.objectContaining({ personId: f.requesterId })]);
    expect(decidido?.body).toContain("Falta el plan de seguridad");
  });

  it("sin Presidencia activa el aval se crea y espera: nadie recibe aviso ni puede decidirlo", async () => {
    const f = await setup(false);

    expect(await avisos()).toEqual([]);
    await expect(
      decideEventApprovalAs({ personId: f.presidentId, ip: null }, f.aval, {
        decision: "APPROVED",
      }),
    ).rejects.toThrow(t("T-5088", { cargo: presidencia }));
    expect((await approvalOf(f.aval))?.status).toBe("PENDING");
  });
});
