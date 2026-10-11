import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  addCardNoteAs,
  admitFromCardAs,
  cardTaskInputSchema,
  cardUpdateSchema,
  createCardTaskAs,
  deleteStageAs,
  moveStageAs,
  updateCardAs,
} from "@/modules/crm";
import { card, interaction, pipelineStage, task } from "@/modules/crm/schema";
import { membership } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import {
  seedCard,
  seedCommittee,
  seedOrganization,
  seedPerson,
  seedPipeline,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

// DT-146 inciso (b), ADR-122 regla 1: la página de un pipeline edita sus tarjetas, da de alta desde
// ellas y mueve o borra sus etapas. Los cuatro comandos reciben el pipeline de la página y lo
// comprueban: la tarjeta o la etapa de otro pipeline responde como una que no existe (T-032).
// La nota y la tarea de una tarjeta van por sus propios comandos, que reciben la tarjeta y el
// pipeline: el sujeto, que es en cuya ficha queda lo escrito, lo lee el comando de la tarjeta.

const admin = { personId: null, ip: null };
const TITLE = "Tarjeta ajena";
const NOTE = "Llamar antes del viernes";
const TASK = cardTaskInputSchema.parse({ title: "Pedir la carta de intención" });

async function setup() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3");
  const page = await seedPipeline("El de la página");
  const other = await seedPipeline("El otro");
  const personId = await seedPerson("aspirante.alcance@eafit.edu.co");
  const firstStage = other.stages[0]?.id ?? "";
  const cardId = await seedCard(other.id, firstStage, { personId }, { title: TITLE });
  const organizationId = await seedOrganization("Empresa Sintética");
  const organizationCardId = await seedCard(other.id, firstStage, { organizationId });
  return {
    termId,
    a3,
    page,
    other,
    personId,
    cardId,
    firstStage,
    organizationId,
    organizationCardId,
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

async function cardOf(id: string) {
  const [row] = await getDb()
    .select({ title: card.title, stageId: card.stageId })
    .from(card)
    .where(eq(card.id, id));
  return row;
}

/** Las etapas del otro pipeline, en su orden. */
async function stagesOf(f: Fixture): Promise<string[]> {
  const rows = await getDb()
    .select({ id: pipelineStage.id })
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, f.other.id))
    .orderBy(asc(pipelineStage.sortOrder));
  return rows.map((row) => row.id);
}

/** Lo que hay escrito sobre los sujetos de las tarjetas: notas en su ficha y tareas. */
async function notesAndTasks() {
  const db = getDb();
  return {
    notes: await db
      .select({
        personId: interaction.personId,
        organizationId: interaction.organizationId,
        kind: interaction.kind,
        body: interaction.body,
      })
      .from(interaction)
      .orderBy(asc(interaction.createdAt), asc(interaction.id)),
    tasks: await db
      .select({
        cardId: task.cardId,
        personId: task.personId,
        organizationId: task.organizationId,
        title: task.title,
      })
      .from(task)
      .orderBy(asc(task.createdAt), asc(task.id)),
  };
}

async function audits(): Promise<number> {
  return (await getDb().select({ id: auditLog.id }).from(auditLog)).length;
}

describe("las tarjetas y las etapas desde la página de su pipeline", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("editar desde un pipeline la tarjeta de otro responde como si no existiera y no la cambia", async () => {
    const f = await setup();
    const before = await audits();

    await expect(
      updateCardAs(admin, f.cardId, cardUpdateSchema.parse({ title: "Cambiada" }), {
        pipelineId: f.page.id,
      }),
    ).rejects.toThrow(t("T-032"));

    expect(await cardOf(f.cardId)).toEqual({ title: TITLE, stageId: f.firstStage });
    expect(await audits()).toBe(before);
  });

  it("dar de alta desde un pipeline con la tarjeta de otro no admite a nadie", async () => {
    const f = await setup();
    const before = await audits();

    await expect(
      admitFromCardAs(
        admin,
        f.cardId,
        { termId: f.termId, committeeIds: [f.a3] },
        { pipelineId: f.page.id },
      ),
    ).rejects.toThrow(t("T-032"));

    expect(
      await getDb().select().from(membership).where(eq(membership.personId, f.personId)),
    ).toEqual([]);
    expect(await cardOf(f.cardId)).toEqual({ title: TITLE, stageId: f.firstStage });
    expect(await audits()).toBe(before);
  });

  it("dejar una nota desde un pipeline en la tarjeta de otro responde como si no existiera y no escribe en la ficha de su persona ni de su organización", async () => {
    const f = await setup();
    const before = await audits();

    for (const cardId of [f.cardId, f.organizationCardId]) {
      await expect(addCardNoteAs(admin, cardId, NOTE, { pipelineId: f.page.id })).rejects.toThrow(
        t("T-032"),
      );
    }

    expect(await notesAndTasks()).toEqual({ notes: [], tasks: [] });
    expect(await audits()).toBe(before);
  });

  it("abrir una tarea desde un pipeline sobre la tarjeta de otro responde como si no existiera y no la crea", async () => {
    const f = await setup();
    const before = await audits();

    for (const cardId of [f.cardId, f.organizationCardId]) {
      await expect(
        createCardTaskAs(admin, cardId, TASK, { pipelineId: f.page.id }),
      ).rejects.toThrow(t("T-032"));
    }

    expect(await notesAndTasks()).toEqual({ notes: [], tasks: [] });
    expect(await audits()).toBe(before);
  });

  it("la nota y la tarea de una tarjeta que no existe tampoco entran", async () => {
    const f = await setup();

    await expect(
      addCardNoteAs(admin, "tarjeta-que-no-existe", NOTE, { pipelineId: f.page.id }),
    ).rejects.toThrow(t("T-032"));
    await expect(
      createCardTaskAs(admin, "tarjeta-que-no-existe", TASK, { pipelineId: f.page.id }),
    ).rejects.toThrow(t("T-032"));

    expect(await notesAndTasks()).toEqual({ notes: [], tasks: [] });
  });

  it("mover desde un pipeline la etapa de otro no cambia su orden", async () => {
    const f = await setup();
    const order = await stagesOf(f);

    await expect(
      moveStageAs(admin, order[1] ?? "", "up", { pipelineId: f.page.id }),
    ).rejects.toThrow(t("T-032"));

    expect(await stagesOf(f)).toEqual(order);
  });

  it("borrar desde un pipeline la etapa de otro no la borra", async () => {
    const f = await setup();
    const order = await stagesOf(f);
    const before = await audits();

    await expect(deleteStageAs(admin, order[1] ?? "", { pipelineId: f.page.id })).rejects.toThrow(
      t("T-032"),
    );

    expect(await stagesOf(f)).toEqual(order);
    expect(await audits()).toBe(before);
  });

  it("sin el pipeline de la página ninguno de los seis hace nada", async () => {
    const f = await setup();
    const order = await stagesOf(f);

    for (const scope of [undefined, null, {}, { pipelineId: "" }]) {
      const missing = scope as never;
      await expect(
        updateCardAs(admin, f.cardId, cardUpdateSchema.parse({ title: "Cambiada" }), missing),
      ).rejects.toThrow(t("T-032"));
      await expect(
        admitFromCardAs(admin, f.cardId, { termId: f.termId, committeeIds: [f.a3] }, missing),
      ).rejects.toThrow(t("T-032"));
      await expect(moveStageAs(admin, order[1] ?? "", "up", missing)).rejects.toThrow(t("T-032"));
      await expect(deleteStageAs(admin, order[1] ?? "", missing)).rejects.toThrow(t("T-032"));
      await expect(addCardNoteAs(admin, f.cardId, NOTE, missing)).rejects.toThrow(t("T-032"));
      await expect(createCardTaskAs(admin, f.cardId, TASK, missing)).rejects.toThrow(t("T-032"));
    }

    expect(await cardOf(f.cardId)).toEqual({ title: TITLE, stageId: f.firstStage });
    expect(await stagesOf(f)).toEqual(order);
    expect(await notesAndTasks()).toEqual({ notes: [], tasks: [] });
  });

  it("desde su pipeline, la tarjeta se edita y la etapa se mueve", async () => {
    const f = await setup();
    const order = await stagesOf(f);

    await updateCardAs(admin, f.cardId, cardUpdateSchema.parse({ title: "Corregida" }), {
      pipelineId: f.other.id,
    });
    await moveStageAs(admin, order[1] ?? "", "up", { pipelineId: f.other.id });

    expect((await cardOf(f.cardId))?.title).toBe("Corregida");
    expect(await stagesOf(f)).toEqual([order[1], order[0], ...order.slice(2)]);
  });

  it("desde su pipeline, la nota queda en la ficha del sujeto de la tarjeta y la tarea queda ligada a la tarjeta y a su sujeto", async () => {
    const f = await setup();
    const scope = { pipelineId: f.other.id };

    await addCardNoteAs(admin, f.cardId, NOTE, scope);
    await addCardNoteAs(admin, f.organizationCardId, NOTE, scope);
    await createCardTaskAs(admin, f.cardId, TASK, scope);
    await createCardTaskAs(admin, f.organizationCardId, TASK, scope);

    expect(await notesAndTasks()).toEqual({
      notes: [
        { personId: f.personId, organizationId: null, kind: "NOTE", body: NOTE },
        { personId: null, organizationId: f.organizationId, kind: "NOTE", body: NOTE },
      ],
      tasks: [
        { cardId: f.cardId, personId: f.personId, organizationId: null, title: TASK.title },
        {
          cardId: f.organizationCardId,
          personId: null,
          organizationId: f.organizationId,
          title: TASK.title,
        },
      ],
    });
  });
});
