import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { notificationRequested } from "@/domain-events/comms";
import {
  changeEventApprovalRiskAs,
  decideEventApprovalAs,
  getEventApprovalDetail,
  requestEventApprovalAs,
  resubmitEventApprovalAs,
  returnEventApprovalAs,
} from "@/modules/finance";
import { eventApproval, eventApprovalEntry } from "@/modules/finance/schema";
import { APPOINTMENT_KINDS } from "@/modules/people";
import { auditLog, outbox } from "@/modules/system/schema";
import { t, tLabels, tList } from "@/shared/copy";
import { seedAppointment, seedCommittee, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// ADR-197 reglas 1 y 2: el comité declara el semáforo de riesgo y lo justifica; la Presidencia puede
// devolver el aval con comentarios sin decidirlo, y el comité envía una versión nueva; la Presidencia
// también cambia el semáforo, con su motivo. Todo queda en la historia del aval y en la auditoría.

const presidencia = tLabels("T-444", APPOINTMENT_KINDS).PRESIDENT;
const guard = (index: number) => tList("T-5113")[index] ?? "";
const VERDE = {
  riskLevel: "GREEN" as const,
  riskJustification: "Actividad de rutina, sin publicaciones sensibles",
};

async function setup() {
  const termId = await seedTerm();
  const pixel = await seedCommittee("pixel", "PIXEL");
  const otro = await seedCommittee("otro", "Otro comité");
  const requesterId = await seedMember("pide.vuelta@eafit.edu.co");
  const editorId = await seedMember("corrige.vuelta@eafit.edu.co");
  const presidentId = await seedMember("presidencia.vuelta@eafit.edu.co");
  await seedAppointment(presidentId, termId, "PRESIDENT");
  const { id: aval } = await requestEventApprovalAs(
    { personId: requesterId, ip: null },
    {
      committeeId: pixel,
      title: "Noche sintética",
      eventOn: "2099-11-20",
      riskLevel: "YELLOW",
      riskJustification: "Hay música en vivo y fotos que se publican",
    },
  );
  return {
    pixel,
    otro,
    aval,
    requester: { personId: requesterId, ip: null },
    editor: { personId: editorId, ip: null },
    president: { personId: presidentId, ip: null },
    requesterId,
    editorId,
    presidentId,
  };
}

async function approvalOf(id: string) {
  const [row] = await getDb().select().from(eventApproval).where(eq(eventApproval.id, id));
  return row;
}

async function entriesOf(id: string) {
  return getDb()
    .select()
    .from(eventApprovalEntry)
    .where(eq(eventApprovalEntry.approvalId, id))
    .orderBy(asc(eventApprovalEntry.createdAt), asc(eventApprovalEntry.version));
}

async function avisos() {
  return (
    await getDb().select().from(outbox).where(eq(outbox.eventType, notificationRequested.type))
  ).map(
    (row) =>
      row.payload as { dedupeKey: string; body: string; recipients: Array<{ personId: string }> },
  );
}

async function auditActions(): Promise<string[]> {
  return (await getDb().select({ action: auditLog.action }).from(auditLog)).map(
    (row) => row.action,
  );
}

describe("el semáforo al pedir el aval", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("guarda el nivel declarado y su porqué, y abre la historia con la versión 1", async () => {
    const f = await setup();

    expect(await approvalOf(f.aval)).toMatchObject({
      status: "PENDING",
      version: 1,
      riskLevel: "YELLOW",
      riskJustification: "Hay música en vivo y fotos que se publican",
    });
    expect(await entriesOf(f.aval)).toEqual([
      expect.objectContaining({
        version: 1,
        kind: "SUBMITTED",
        title: "Noche sintética",
        riskLevel: "YELLOW",
        authorId: f.requesterId,
      }),
    ]);
  });

  it("sin justificar el nivel no se pide", async () => {
    const f = await setup();

    await expect(
      requestEventApprovalAs(f.requester, {
        committeeId: f.pixel,
        title: "Otro evento",
        eventOn: "2099-11-21",
        riskLevel: "RED",
        riskJustification: " ",
      }),
    ).rejects.toThrow(guard(6));
  });
});

describe("devolver con comentarios", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("solo la Presidencia devuelve, con comentarios, y devolver no decide", async () => {
    const f = await setup();

    await expect(
      returnEventApprovalAs(f.requester, f.aval, { note: "Ajusten el plan" }),
    ).rejects.toThrow(t("T-5088", { cargo: presidencia }));
    await expect(returnEventApprovalAs(f.president, f.aval, { note: " " })).rejects.toThrow(
      guard(2),
    );

    await returnEventApprovalAs(f.president, f.aval, {
      note: "Falta el plan de logística de la tarima",
    });

    expect(await approvalOf(f.aval)).toMatchObject({
      status: "RETURNED",
      version: 1,
      decidedAt: null,
      decidedById: null,
    });
    expect((await entriesOf(f.aval)).at(-1)).toMatchObject({
      kind: "RETURNED",
      version: 1,
      note: "Falta el plan de logística de la tarima",
      authorId: f.presidentId,
    });
    expect(await auditActions()).toContain("event-approval.returned");
  });

  it("un aval devuelto no se decide ni se vuelve a devolver hasta la versión nueva", async () => {
    const f = await setup();
    await returnEventApprovalAs(f.president, f.aval, { note: "Ajusten la fecha" });

    await expect(
      decideEventApprovalAs(f.president, f.aval, { decision: "APPROVED" }),
    ).rejects.toThrow(guard(0));
    await expect(returnEventApprovalAs(f.president, f.aval, { note: "Otra vez" })).rejects.toThrow(
      guard(0),
    );
  });

  it("avisa a quien lo pidió con los comentarios", async () => {
    const f = await setup();

    await returnEventApprovalAs(f.president, f.aval, { note: "Falta el plan de seguridad" });

    const devuelto = (await avisos()).find(
      (row) => row.dedupeKey === `aval-evento-devuelto:${f.aval}:v1`,
    );
    expect(devuelto?.recipients).toEqual([expect.objectContaining({ personId: f.requesterId })]);
    expect(devuelto?.body).toContain("Falta el plan de seguridad");
  });
});

describe("la versión nueva", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("el comité corrige el aval devuelto: sube la versión, vuelve a pendiente y avisa a la Presidencia", async () => {
    const f = await setup();
    await returnEventApprovalAs(f.president, f.aval, { note: "Cambien la fecha" });

    await resubmitEventApprovalAs(
      f.editor,
      f.aval,
      {
        title: "Noche sintética, corregida",
        eventOn: "2099-11-27",
        description: "Con el plan de logística",
        riskLevel: "GREEN",
        riskJustification: "Ya no hay tarima ni música en vivo",
      },
      { committeeId: f.pixel },
    );

    expect(await approvalOf(f.aval)).toMatchObject({
      status: "PENDING",
      version: 2,
      title: "Noche sintética, corregida",
      eventOn: "2099-11-27",
      riskLevel: "GREEN",
      riskJustification: "Ya no hay tarima ni música en vivo",
    });
    const entries = await entriesOf(f.aval);
    expect(entries.map((entry) => [entry.version, entry.kind])).toEqual([
      [1, "SUBMITTED"],
      [1, "RETURNED"],
      [2, "SUBMITTED"],
    ]);
    // La versión 1 conserva lo que decía.
    expect(entries[0]).toMatchObject({ title: "Noche sintética", eventOn: "2099-11-20" });
    expect(await avisos()).toContainEqual(
      expect.objectContaining({
        dedupeKey: `aval-evento:${f.aval}:v2`,
        recipients: [expect.objectContaining({ personId: f.presidentId })],
      }),
    );

    // Y la Presidencia decide la versión nueva; el aviso llega a quien lo pidió y a quien lo corrigió.
    await decideEventApprovalAs(f.president, f.aval, { decision: "APPROVED" });
    const decidido = (await avisos()).find(
      (row) => row.dedupeKey === `aval-evento-decidido:${f.aval}`,
    );
    expect(decidido?.recipients.map((item) => item.personId).sort()).toEqual(
      [f.requesterId, f.editorId].sort(),
    );
  });

  it("solo se reenvía un aval devuelto, y desde su propio comité", async () => {
    const f = await setup();
    const version = { title: "Noche sintética", eventOn: "2099-11-20", ...VERDE };

    await expect(
      resubmitEventApprovalAs(f.editor, f.aval, version, { committeeId: f.pixel }),
    ).rejects.toThrow(guard(1));

    await returnEventApprovalAs(f.president, f.aval, { note: "Ajusten" });
    await expect(
      resubmitEventApprovalAs(f.editor, f.aval, version, { committeeId: f.otro }),
    ).rejects.toThrow(t("T-032"));
    expect((await approvalOf(f.aval))?.status).toBe("RETURNED");
  });
});

describe("cambiar el semáforo", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("la Presidencia lo cambia con su motivo, queda en la historia y en la auditoría, y avisa al comité", async () => {
    const f = await setup();

    await expect(
      changeEventApprovalRiskAs(f.requester, f.aval, { riskLevel: "RED", note: "Por si acaso" }),
    ).rejects.toThrow(t("T-5088", { cargo: presidencia }));
    await expect(
      changeEventApprovalRiskAs(f.president, f.aval, { riskLevel: "RED", note: "" }),
    ).rejects.toThrow(guard(3));
    await expect(
      changeEventApprovalRiskAs(f.president, f.aval, { riskLevel: "YELLOW", note: "Igual" }),
    ).rejects.toThrow(guard(5));

    await changeEventApprovalRiskAs(f.president, f.aval, {
      riskLevel: "RED",
      note: "Se publica en redes con un tema sensible",
    });

    expect((await approvalOf(f.aval))?.riskLevel).toBe("RED");
    expect((await entriesOf(f.aval)).at(-1)).toMatchObject({
      kind: "RISK_CHANGED",
      riskLevel: "RED",
      note: "Se publica en redes con un tema sensible",
      authorId: f.presidentId,
    });
    expect(await auditActions()).toContain("event-approval.risk-changed");
    expect(await avisos()).toContainEqual(
      expect.objectContaining({
        recipients: [expect.objectContaining({ personId: f.requesterId })],
        body: expect.stringContaining("Se publica en redes con un tema sensible"),
      }),
    );
  });

  it("un aval aprobado todavía cambia de semáforo; uno rechazado ya no", async () => {
    const f = await setup();
    await decideEventApprovalAs(f.president, f.aval, { decision: "APPROVED" });
    await changeEventApprovalRiskAs(f.president, f.aval, {
      riskLevel: "RED",
      note: "Cambió el lugar",
    });
    expect((await approvalOf(f.aval))?.riskLevel).toBe("RED");

    const { id: rechazado } = await requestEventApprovalAs(f.requester, {
      committeeId: f.pixel,
      title: "Otro evento",
      eventOn: "2099-11-21",
      ...VERDE,
    });
    await decideEventApprovalAs(f.president, rechazado, {
      decision: "REJECTED",
      note: "Se cruza con la asamblea",
    });
    await expect(
      changeEventApprovalRiskAs(f.president, rechazado, { riskLevel: "RED", note: "Tarde" }),
    ).rejects.toThrow(guard(4));
  });
});

describe("la ficha del aval", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("trae el comité y la historia en orden", async () => {
    const f = await setup();
    await returnEventApprovalAs(f.president, f.aval, { note: "Ajusten" });

    const detail = await getEventApprovalDetail(f.aval);
    expect(detail).toMatchObject({ id: f.aval, committeeName: "PIXEL", committeeSlug: "pixel" });
    expect(detail?.entries.map((entry) => entry.kind)).toEqual(["SUBMITTED", "RETURNED"]);
    expect(await getEventApprovalDetail("no-existe-este-aval")).toBeNull();
  });
});
