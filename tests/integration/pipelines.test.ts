import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
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
import { createCard, moveCard } from "@/modules/crm/domain/cards";
import { deleteStage, saveStage } from "@/modules/crm/domain/pipelines";
import { card, interaction, task } from "@/modules/crm/schema";
import { getPublicForm, submitFormAs } from "@/modules/forms";
import { getMembershipRef, getMyMembership } from "@/modules/people";
import { person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import type { MailTransport } from "@/shared/adapters/mail";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { copyPattern, itemPattern } from "../helpers/copy";
import { holdCommand, waitingOn, whileHeld } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  seedCard,
  seedCommittee,
  seedForm,
  seedMember,
  seedOrganization,
  seedPerson,
  seedPipeline,
  seedTerm,
} from "./factories";

// Pipelines y tarjetas (ADR-037 reglas 7 y 8): plantillas por tipo, un sujeto por tarjeta, mover con
// cierre y reapertura, tarjeta por outbox desde la respuesta, postulante, dar de alta en una
// transacción, patrocinio ganado con tarea y correo de bienvenida al drenar.

const admin = { personId: null, ip: null };

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

function fakeTransport(): MailTransport {
  return { name: "resend", send: async () => ({ id: "re_ok" }) };
}

/** El recurso del kit exige un actor con persona: un ADMIN sintético por prueba. */
async function pipelineWithTemplate(kind: "ADMISSION" | "SPONSORSHIP" | "CUSTOM", name = "P") {
  const adminId = await seedMember(
    `admin-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@eafit.edu.co`,
  );
  const created = await pipelinesResource.create?.({ personId: adminId, ip: null }, { name, kind });
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
    expect(custom.stages.map((stage) => stage.name)).toEqual(tList("T-967"));
    await expect(
      saveStageAs(admin, id, null, { name: "Rara", isWon: true, isLost: true }),
    ).rejects.toThrow(t("T-979"));
    const added = await saveStageAs(admin, id, null, {
      name: "Prueba técnica",
      isWon: false,
      isLost: false,
    });
    await moveStageAs(admin, added.id, "up", { pipelineId: id });
    await moveStageAs(admin, added.id, "up", { pipelineId: id });
    const reordered = await listStages(id);
    expect(reordered.map((stage) => stage.name)).toEqual([
      ...tList("T-965").slice(0, 3),
      "Prueba técnica",
      ...tList("T-965").slice(3),
    ]);
    await deleteStageAs(admin, added.id, { pipelineId: id });
    expect((await listStages(id)).map((stage) => stage.name)).toEqual(tList("T-965"));
    await expect(
      deleteStageAs(admin, custom.stages[0]?.id ?? "", { pipelineId: custom.id }),
    ).rejects.toThrow(t("T-980"));
  });

  // Las tarjetas que ya están en una etapa siguen su marca (ADR-118 regla 16): hasta entonces
  // `closedAt` solo se escribía al mover la tarjeta.
  const closedAtOf = async (cardId: string) =>
    (await getDb().select({ closedAt: card.closedAt }).from(card).where(eq(card.id, cardId)))[0]
      ?.closedAt ?? null;
  const stageOf = (pipe: { stages: Array<{ id: string }> }, index: number) =>
    pipe.stages[index]?.id ?? "";
  const openCardsOf = async (adminId: string, pipelineId: string) => {
    const listed = await pipelinesResource.list({
      q: "",
      page: 1,
      pageSize: 20,
      filters: {},
      actor: { personId: adminId, isAdmin: true },
    });
    return listed.rows.find((row) => row.id === pipelineId)?.openCards;
  };

  it("marcar como ganada o perdida una etapa cierra las tarjetas que ya están en ella, y desmarcarla las reabre", async () => {
    const pipe = await seedPipeline("Alianzas", "CUSTOM", [
      { name: "Contacto" },
      { name: "Propuesta" },
    ]);
    const adminId = await seedMember("admin-etapas@eafit.edu.co");
    const proposal = stageOf(pipe, 1);
    const inStage = await seedCard(pipe.id, proposal, {
      personId: await seedPerson("contacto@example.com"),
    });
    const elsewhere = await seedCard(pipe.id, stageOf(pipe, 0), {
      personId: await seedPerson("otro.contacto@example.com"),
    });
    expect(await openCardsOf(adminId, pipe.id)).toBe(2);

    await saveStageAs(admin, pipe.id, proposal, { name: "Propuesta", isWon: true, isLost: false });
    const closedAt = await closedAtOf(inStage);
    expect(closedAt).toBeInstanceOf(Date);
    expect(await closedAtOf(elsewhere)).toBeNull();
    expect(await openCardsOf(adminId, pipe.id)).toBe(1);

    // De ganada a perdida la tarjeta sigue cerrada, con la fecha que ya tenía.
    await saveStageAs(admin, pipe.id, proposal, { name: "Propuesta", isWon: false, isLost: true });
    expect(await closedAtOf(inStage)).toEqual(closedAt);

    await saveStageAs(admin, pipe.id, proposal, { name: "Propuesta", isWon: false, isLost: false });
    expect(await closedAtOf(inStage)).toBeNull();
    expect(await openCardsOf(adminId, pipe.id)).toBe(2);
  });

  it("guardar una etapa ganada cierra la tarjeta que había quedado abierta en ella y deja la cuenta en la auditoría", async () => {
    const pipe = await seedPipeline("Alianzas", "CUSTOM", [
      { name: "Contacto" },
      { name: "Firmada", isWon: true },
    ]);
    const signed = stageOf(pipe, 1);
    // Como quedaban antes de la regla: abierta, en una etapa que ya era ganada.
    const stray = await seedCard(pipe.id, signed, {
      personId: await seedPerson("descuadrada@example.com"),
    });
    expect(await closedAtOf(stray)).toBeNull();

    await saveStageAs(admin, pipe.id, signed, {
      name: "Firmada y pagada",
      isWon: true,
      isLost: false,
    });

    expect(await closedAtOf(stray)).toBeInstanceOf(Date);
    const audits = await getDb()
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(and(eq(auditLog.action, "pipeline.stage-updated"), eq(auditLog.entityId, pipe.id)));
    expect(audits).toEqual([
      { after: { name: "Firmada y pagada", isWon: true, isLost: false, closedCards: 1 } },
    ]);
  });

  it("marcar como ganada una etapa con tarjetas las cierra sin los efectos de moverlas: ni tarea de patrocinio ni membresía exigida (decisión abierta 46)", async () => {
    const sponsorship = await seedPipeline("Patrocinios", "SPONSORSHIP", [
      { name: "Contacto" },
      { name: "Negociación" },
    ]);
    const sponsored = await seedCard(sponsorship.id, stageOf(sponsorship, 1), {
      organizationId: await seedOrganization("Aliado sintético"),
    });
    await saveStageAs(admin, sponsorship.id, stageOf(sponsorship, 1), {
      name: "Negociación",
      isWon: true,
      isLost: false,
    });
    expect(await closedAtOf(sponsored)).toBeInstanceOf(Date);
    // Mover la tarjeta a una etapa ganada abre la tarea de seguimiento (T-994); marcar la etapa, no.
    expect(await getDb().select().from(task)).toEqual([]);

    const admission = await seedPipeline("Admisión", "ADMISSION", [
      { name: "Recibida" },
      { name: "Entrevista" },
    ]);
    const applicant = await seedPerson("postulante@example.com");
    const applying = await seedCard(admission.id, stageOf(admission, 1), { personId: applicant });
    // Mover a una etapa ganada de admisión exige la membresía (T-991); marcar la etapa, no.
    await saveStageAs(admin, admission.id, stageOf(admission, 1), {
      name: "Entrevista",
      isWon: true,
      isLost: false,
    });
    expect(await closedAtOf(applying)).toBeInstanceOf(Date);
    expect(await getMembershipRef(applicant)).toBeNull();
  });

  it("una tarjeta que entra a la etapa mientras se guarda su marca queda con la marca nueva, llegue quien llegue primero", async () => {
    const pipe = await seedPipeline("Alianzas", "CUSTOM", [
      { name: "Contacto" },
      { name: "Propuesta" },
    ]);
    const proposal = stageOf(pipe, 1);
    const won = { name: "Propuesta", isWon: true, isLost: false };
    const arriving = await seedCard(pipe.id, stageOf(pipe, 0), {
      personId: await seedPerson("llega@example.com"),
    });

    // La marca entra primero y no ha confirmado: mover espera y lee la marca nueva.
    const marking = await holdCommand(admin, (ctx) => saveStage(ctx, pipe.id, proposal, won));
    const moving = moveCardAs(admin, arriving, proposal);
    try {
      await vi.waitFor(async () => expect(await waitingOn(marking.pid)).toBeGreaterThan(0), {
        timeout: 5_000,
      });
    } finally {
      marking.release();
      await marking.done;
      await moving;
    }
    expect(await closedAtOf(arriving)).toBeInstanceOf(Date);

    // Al revés: mover entra primero y no ha confirmado. Desmarcar espera y reabre también a la recién llegada.
    const other = await seedCard(pipe.id, stageOf(pipe, 0), {
      personId: await seedPerson("otra.llega@example.com"),
    });
    const held = await holdCommand(admin, (ctx) => moveCard(ctx, other, proposal));
    const unmarking = saveStageAs(admin, pipe.id, proposal, { ...won, isWon: false });
    try {
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBeGreaterThan(0), {
        timeout: 5_000,
      });
    } finally {
      held.release();
      await held.done;
      await unmarking;
    }
    expect(await closedAtOf(other)).toBeNull();
    expect(await closedAtOf(arriving)).toBeNull();
  });

  // DT-251 (c): crear una tarjeta elegía su etapa sin tomarla. Las tres pruebas dejan a uno de los dos
  // escrito y sin confirmar y miran dónde y cómo queda la tarjeta: nunca abierta en una etapa ganada.
  const cardsIn = (pipelineId: string) =>
    getDb()
      .select({ stageId: card.stageId, closedAt: card.closedAt })
      .from(card)
      .where(eq(card.pipelineId, pipelineId));

  it("una tarjeta nueva espera a la marca sin confirmar de su primera etapa y entra a la siguiente abierta", async () => {
    const pipe = await seedPipeline("Convenios", "CUSTOM", [
      { name: "Contacto" },
      { name: "Propuesta" },
    ]);
    const personId = await seedPerson("nueva.tarjeta@example.com");
    const marking = await holdCommand(admin, (ctx) =>
      saveStage(ctx, pipe.id, stageOf(pipe, 0), { name: "Contacto", isWon: true, isLost: false }),
    );

    const how = await whileHeld(marking, () => createCardAs(admin, pipe.id, { personId }));

    expect(await cardsIn(pipe.id)).toEqual([{ stageId: stageOf(pipe, 1), closedAt: null }]);
    expect(how).toBe("hizo cola");
  });

  it("la marca de una etapa espera a la tarjeta que se está creando en ella y la cierra también", async () => {
    const pipe = await seedPipeline("Aliados", "CUSTOM", [
      { name: "Contacto" },
      { name: "Propuesta" },
    ]);
    const personId = await seedPerson("creando.tarjeta@example.com");
    const creating = await holdCommand(admin, (ctx) => createCard(ctx, pipe.id, { personId }));

    const how = await whileHeld(creating, () =>
      saveStageAs(admin, pipe.id, stageOf(pipe, 0), {
        name: "Contacto",
        isWon: true,
        isLost: false,
      }),
    );

    expect(await cardsIn(pipe.id)).toEqual([
      { stageId: stageOf(pipe, 0), closedAt: expect.any(Date) },
    ]);
    expect(how).toBe("hizo cola");
  });

  // La rama «se borró» de ADR-122 regla 3: la etapa elegida ya no está cuando la creación la toma.
  it("una tarjeta nueva espera al borrado sin confirmar de su primera etapa y entra a la siguiente abierta", async () => {
    const pipe = await seedPipeline("Depurado", "CUSTOM", [
      { name: "Contacto" },
      { name: "Propuesta" },
    ]);
    const personId = await seedPerson("tarjeta.borrado@example.com");
    const deleting = await holdCommand(admin, (ctx) =>
      deleteStage(ctx, stageOf(pipe, 0), { pipelineId: pipe.id }),
    );

    const how = await whileHeld(deleting, () => createCardAs(admin, pipe.id, { personId }));

    expect(await cardsIn(pipe.id)).toEqual([{ stageId: stageOf(pipe, 1), closedAt: null }]);
    expect(how).toBe("hizo cola");
  });

  // El otro orden de llegada: el borrado contaba las tarjetas antes de esperar, no veía la que iba en
  // vuelo y terminaba con el error de la llave foránea, sin traducir.
  it("borrar una etapa espera a la tarjeta que se está creando en ella y responde que tiene tarjetas", async () => {
    const pipe = await seedPipeline("Vigente", "CUSTOM", [
      { name: "Contacto" },
      { name: "Propuesta" },
    ]);
    const personId = await seedPerson("creando.borrado@example.com");
    const creating = await holdCommand(admin, (ctx) => createCard(ctx, pipe.id, { personId }));
    const answer: { error: unknown } = { error: null };

    const how = await whileHeld(creating, () =>
      deleteStageAs(admin, stageOf(pipe, 0), { pipelineId: pipe.id }).catch((error: unknown) => {
        answer.error = error;
      }),
    );

    expect(how).toBe("hizo cola");
    expect(answer.error).toEqual(new DomainError(t("T-980")));
    expect(await listStages(pipe.id)).toHaveLength(2);
    expect(await cardsIn(pipe.id)).toEqual([{ stageId: stageOf(pipe, 0), closedAt: null }]);
  });

  it("la tarjeta de una respuesta también espera a la marca sin confirmar de su primera etapa", async () => {
    const { id, stages } = await pipelineWithTemplate("ADMISSION", "Admisión en carrera");
    await seedForm("admision-carrera", {
      fields: [{ key: "motivo", label: "Motivo", type: "TEXTAREA", required: true }],
      actions: { createPerson: true, pipelineId: id },
    });
    const view = await getPublicForm("admision-carrera");
    if (!view) throw new Error("form");
    const result = await submitFormAs(null, view, {
      identity: { firstName: "Ana", lastName: "Ruiz", email: "ana.ruiz@eafit.edu.co" },
      answers: { motivo: "Quiero aportar" },
      consent: true,
      ip: "10.0.0.9",
    });
    expect(result.ok).toBe(true);
    const marking = await holdCommand(admin, (ctx) =>
      saveStage(ctx, id, stageOf({ stages }, 0), {
        name: stages[0]?.name ?? "",
        isWon: false,
        isLost: true,
      }),
    );

    const how = await whileHeld(marking, () => drainOutbox());

    expect(await cardsIn(id)).toEqual([{ stageId: stageOf({ stages }, 1), closedAt: null }]);
    expect(how).toBe("hizo cola");
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
    expect(view).toMatchObject({
      stageName: tList("T-966")[0],
      closedAt: null,
      subjectName: "Postobón",
    });
    const won = stages.find((stage) => stage.isWon);
    const lost = stages.find((stage) => stage.isLost);
    if (!won || !lost) throw new Error("stages");
    await moveCardAs(admin, created.id, won.id);
    view = await getCard(created.id);
    expect(view?.closedAt).toBeInstanceOf(Date);
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
    await drainOutbox();
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.organizationId, organizationId));
    expect(timeline.map((item) => item.kind)).toEqual(["PIPELINE", "PIPELINE", "PIPELINE"]);
    expect(timeline[0]?.summary).toBe(
      (tList("T-1046")[2] ?? "").replace("{pipeline}", "P").replace("{etapa}", tList("T-966")[0]),
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
    await drainOutbox();
    const [who] = await getDb().select().from(person).where(eq(person.email, "lu@eafit.edu.co"));
    if (!who) throw new Error("person");
    expect(who.stage).toBe("APPLICANT");
    const cards = await listCardsByPerson(who.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      stageName: tList("T-965")[0],
      title: "Lu Gómez",
      pipelineId: id,
    });
    // El mismo evento otra vez no duplica (idempotente por la respuesta).
    const [event] = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "submission.received"));
    if (!event) throw new Error("event");
    await getDb().update(outbox).set({ processedAt: null }).where(eq(outbox.id, event.id));
    await drainOutbox();
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
    await expect(moveCardAs(admin, created.id, won.id)).rejects.toThrow(
      t("T-991", { etapa: tList("T-965")[3] }),
    );
    const result = await admitFromCardAs(
      admin,
      created.id,
      { termId, committeeIds: [a3] },
      { pipelineId: id },
    );
    expect(result.membershipId).toBeTruthy();
    expect(await getMembershipRef(personId)).toMatchObject({
      status: "ACTIVE",
      firstTermId: termId,
    });
    const view = await getCard(created.id);
    expect(view).toMatchObject({ stageName: tList("T-965")[3], stageIsWon: true });
    expect(view?.closedAt).toBeInstanceOf(Date);
    expect((await getMyMembership(personId)).committees.map((row) => row.committeeSlug)).toEqual([
      "a3",
    ]);
    // Una segunda alta se rechaza (ya tiene membresía) y un externo o un correo ajeno también.
    await expect(
      admitFromCardAs(admin, created.id, { termId, committeeIds: [a3] }, { pipelineId: id }),
    ).rejects.toThrow(copyPattern("T-986"));
    const external = await seedPerson("contacto@empresa.com", { kind: "EXTERNAL" });
    const externalCard = await createCardAs(admin, id, { personId: external });
    await expect(
      admitFromCardAs(admin, externalCard.id, { termId, committeeIds: [a3] }, { pipelineId: id }),
    ).rejects.toThrow(t("T-988"));
    // Al drenar: la bienvenida sale por el mailer y queda en `message`; la línea de tiempo anota el alta.
    await drainOutbox();
    const mails = await getDb().select().from(message).where(eq(message.personId, personId));
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ status: "SENT", provider: "resend" });
    expect(mails[0]?.subject).toMatch(itemPattern(tList("T-200")[0]));
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, personId));
    const summaries = timeline.map((item) => item.summary);
    expect(summaries.some((text) => itemPattern(tList("T-1046")[5]).test(text))).toBe(true);
    expect(summaries.some((text) => itemPattern(tList("T-458")[1]).test(text))).toBe(false);
  });
});
