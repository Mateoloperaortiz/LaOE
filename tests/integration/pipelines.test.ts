import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import { setMailTransportsForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import {
  admitFromCardAs,
  createCardAs,
  deleteStageAs,
  getBoard,
  getCard,
  listCardsByPerson,
  listStages,
  moveCardAs,
  moveStageAs,
  saveStageAs,
} from "@/modules/crm";
import { pipelinesResource } from "@/modules/crm/admin";
import { card, interaction, task } from "@/modules/crm/schema";
import { getPublicForm, submitFormAs } from "@/modules/forms";
import { getMembershipRef, getMyMembership } from "@/modules/people";
import { person } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import type { MailTransport } from "@/shared/adapters/mail";
import { t, tList } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedForm,
  seedMember,
  seedOrganization,
  seedPerson,
  seedTerm,
} from "./factories";

// Pipelines y tarjetas (ADR-037 reglas 7 y 8): plantillas por tipo, un sujeto por tarjeta, mover con
// cierre y reapertura, tarjeta por outbox desde la respuesta, postulante, dar de alta en una
// transacción, patrocinio ganado con tarea y correo de bienvenida al drenar.

const admin = { personId: null, ip: null };

function fakeTransport(): MailTransport {
  return { name: "resend", send: async () => ({ id: "re_ok" }) };
}

/** El recurso del kit exige un actor con persona: un ADMIN sintético por prueba. */
async function pipelineWithTemplate(kind: "ADMISSION" | "SPONSORSHIP" | "CUSTOM", name = "P") {
  const adminId = await seedMember(
    `admin-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@eafit.edu.co`,
  );
  const created = await pipelinesResource.create?.(
    { personId: adminId, isAdmin: true },
    { name, kind },
  );
  if (!created) throw new Error("pipeline");
  return { id: created.id, stages: await listStages(created.id) };
}

describe("pipelines y tarjetas", () => {
  beforeEach(truncateAll);
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("crear un pipeline siembra su plantilla y las etapas se editan, ordenan y borran", async () => {
    const { id, stages } = await pipelineWithTemplate("ADMISSION", "Admisión 2026-2");
    expect(stages.map((stage) => stage.name)).toEqual(tList("T-965"));
    expect(stages.map((stage) => [stage.isWon, stage.isLost])).toEqual([
      [false, false],
      [false, false],
      [false, false],
      [true, false],
      [false, true],
    ]);
    const custom = await pipelineWithTemplate("CUSTOM", "Alianzas");
    expect(custom.stages.map((stage) => stage.name)).toEqual(["Nueva"]);
    await expect(
      saveStageAs(admin, id, null, { name: "Rara", isWon: true, isLost: true }),
    ).rejects.toThrow(t("T-979"));
    const added = await saveStageAs(admin, id, null, {
      name: "Prueba técnica",
      isWon: false,
      isLost: false,
    });
    await moveStageAs(admin, added.id, "up");
    await moveStageAs(admin, added.id, "up");
    const reordered = await listStages(id);
    expect(reordered.map((stage) => stage.name)).toEqual([
      "Recibida",
      "Entrevista",
      "Admitida",
      "Prueba técnica",
      "Alta",
      "No admitida",
    ]);
    await deleteStageAs(admin, added.id);
    expect((await listStages(id)).map((stage) => stage.name)).toEqual(tList("T-965"));
    await expect(deleteStageAs(admin, custom.stages[0]?.id ?? "")).rejects.toThrow(t("T-980"));
  });

  it("una tarjeta tiene un sujeto, entra a la primera etapa abierta y mover cierra y reabre", async () => {
    const { id, stages } = await pipelineWithTemplate("SPONSORSHIP");
    const organizationId = await seedOrganization("Postobón");
    await expect(createCardAs(admin, id, { title: "Sin sujeto" })).rejects.toThrow();
    const created = await createCardAs(admin, id, {
      organizationId,
      title: "Postobón · Días EAFIT",
    });
    let view = await getCard(created.id);
    expect(view).toMatchObject({ stageName: "Contacto", closedAt: null, subjectName: "Postobón" });
    const won = stages.find((stage) => stage.isWon);
    const lost = stages.find((stage) => stage.isLost);
    if (!won || !lost) throw new Error("stages");
    await moveCardAs(admin, created.id, won.id);
    view = await getCard(created.id);
    expect(view?.closedAt).not.toBeNull();
    // El patrocinio ganado abre la tarea de seguimiento sobre la organización y la tarjeta.
    const [followUp] = await getDb().select().from(task).where(eq(task.cardId, created.id));
    expect(followUp).toMatchObject({
      organizationId,
      title: t("T-994", { organización: "Postobón" }),
    });
    await moveCardAs(admin, created.id, stages[1]?.id ?? "");
    view = await getCard(created.id);
    expect(view?.closedAt).toBeNull();
    const board = await getBoard(id);
    expect(board.map((column) => column.cards.length)).toEqual([0, 1, 0, 0, 0]);
    await drain(20);
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.organizationId, organizationId));
    expect(timeline.map((item) => item.kind)).toEqual(["PIPELINE", "PIPELINE", "PIPELINE"]);
    expect(timeline[0]?.summary).toBe(
      (tList("T-1046")[2] ?? "").replace("{pipeline}", "P").replace("{etapa}", "Contacto"),
    );
  });

  it("una respuesta con pipeline crea la tarjeta por outbox una sola vez y la persona pasa a postulante", async () => {
    const { id } = await pipelineWithTemplate("ADMISSION");
    const formId = await seedForm("admision", {
      fields: [{ key: "motivo", label: "Motivo", type: "TEXTAREA", required: true }],
      actions: { createPerson: true, pipelineId: id },
    });
    const view = await getPublicForm("admision");
    if (!view) throw new Error("form");
    const result = await submitFormAs(null, view, {
      identity: { firstName: "Lu", lastName: "Gómez", email: "lu@eafit.edu.co" },
      answers: { motivo: "Quiero aportar" },
      consent: true,
      ip: "10.0.0.9",
    });
    expect(result.ok).toBe(true);
    await drain(20);
    const [who] = await getDb().select().from(person).where(eq(person.email, "lu@eafit.edu.co"));
    if (!who) throw new Error("person");
    expect(who.stage).toBe("APPLICANT");
    const cards = await listCardsByPerson(who.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ stageName: "Recibida", title: "Lu Gómez", pipelineId: id });
    // El mismo evento otra vez no duplica (idempotente por la respuesta).
    const [event] = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "submission.received"));
    if (!event) throw new Error("event");
    await getDb().update(outbox).set({ processedAt: null }).where(eq(outbox.id, event.id));
    await drain(20);
    expect(await listCardsByPerson(who.id)).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(card)
        .where(and(eq(card.pipelineId, id), isNull(card.closedAt))),
    ).toHaveLength(1);
    void formId;
  });

  it("dar de alta desde la tarjeta crea la membresía, mueve a la etapa ganada y manda la bienvenida", async () => {
    setMailTransportsForTests({ primary: fakeTransport(), overflow: null });
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const { id, stages } = await pipelineWithTemplate("ADMISSION");
    const personId = await seedPerson("nueva@eafit.edu.co", { stage: "APPLICANT" });
    const created = await createCardAs(admin, id, { personId });
    const won = stages.find((stage) => stage.isWon);
    if (!won) throw new Error("won");
    // Mover a mano a la etapa ganada sin membresía se rechaza.
    await expect(moveCardAs(admin, created.id, won.id)).rejects.toThrow("primero da de alta");
    const result = await admitFromCardAs(admin, created.id, { termId, committeeIds: [a3] });
    expect(result.membershipId).toBeTruthy();
    expect(await getMembershipRef(personId)).toMatchObject({
      status: "ACTIVE",
      firstTermId: termId,
    });
    const view = await getCard(created.id);
    expect(view).toMatchObject({ stageName: "Alta", stageIsWon: true });
    expect(view?.closedAt).not.toBeNull();
    expect((await getMyMembership(personId)).committees.map((row) => row.committeeSlug)).toEqual([
      "a3",
    ]);
    // Una segunda alta se rechaza (ya tiene membresía) y un externo o un correo ajeno también.
    await expect(
      admitFromCardAs(admin, created.id, { termId, committeeIds: [a3] }),
    ).rejects.toThrow("ya tiene membresía");
    const external = await seedPerson("contacto@empresa.com", { kind: "EXTERNAL" });
    const externalCard = await createCardAs(admin, id, { personId: external });
    await expect(
      admitFromCardAs(admin, externalCard.id, { termId, committeeIds: [a3] }),
    ).rejects.toThrow(t("T-988"));
    // Al drenar: la bienvenida sale por el mailer y queda en `message`; la línea de tiempo anota el alta.
    await drain(30);
    const mails = await getDb().select().from(message).where(eq(message.personId, personId));
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ status: "SENT", provider: "resend" });
    expect(mails[0]?.subject).toContain("Bienvenido a la OE");
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, personId));
    const summaries = timeline.map((item) => item.summary);
    expect(summaries.some((text) => text.startsWith("Dado de alta en"))).toBe(true);
    expect(summaries.some((text) => text.startsWith("Estado cambió"))).toBe(false);
  });
});
