import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  admitFromCardAs,
  cardUpdateSchema,
  deleteStageAs,
  moveStageAs,
  updateCardAs,
} from "@/modules/crm";
import { card, pipelineStage } from "@/modules/crm/schema";
import { membership } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedCard, seedCommittee, seedPerson, seedPipeline, seedTerm } from "./factories";

// DT-146 inciso (b), ADR-122 regla 1: la página de un pipeline edita sus tarjetas, da de alta desde
// ellas y mueve o borra sus etapas. Los cuatro comandos reciben el pipeline de la página y lo
// comprueban: la tarjeta o la etapa de otro pipeline responde como una que no existe (T-032).

const admin = { personId: null, ip: null };
const TITLE = "Tarjeta ajena";

async function setup() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3");
  const page = await seedPipeline("El de la página");
  const other = await seedPipeline("El otro");
  const personId = await seedPerson("aspirante.alcance@eafit.edu.co");
  const firstStage = other.stages[0]?.id ?? "";
  const cardId = await seedCard(other.id, firstStage, { personId }, { title: TITLE });
  return { termId, a3, page, other, personId, cardId, firstStage };
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

  it("sin el pipeline de la página ninguno de los cuatro hace nada", async () => {
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
    }

    expect(await cardOf(f.cardId)).toEqual({ title: TITLE, stageId: f.firstStage });
    expect(await stagesOf(f)).toEqual(order);
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
});
