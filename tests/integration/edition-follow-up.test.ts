import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  closeEditionFollowUpAs,
  editionClosure,
  editionHandovers,
  editionLog,
  editionsPendingClosure,
  myEditionHandovers,
  saveEditionEntryAs,
  saveEditionHandoverAs,
  saveTemplateAs,
} from "@/modules/permanence";
import { tList } from "@/shared/copy";
import {
  seedAppointment,
  seedEdition,
  seedEvent,
  seedMacroeventDirector,
  seedMember,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

// El seguimiento de un macroevento (ADR-197 regla 5): la Presidencia guarda el plan del mes y las
// reuniones con Desarrollo Estudiantil; cada cargo de la mesa entrega su empalme, con las preguntas
// generales y las propias del cargo; sin todos los empalmes el seguimiento no se cierra, y la mesa de la
// edición siguiente recibe el empalme de su cargo.

const guard = (index: number) => tList("T-5136")[index] ?? "";
const DAY = 86_400_000;

async function setup() {
  const termId = await seedTerm();
  const presidentId = await seedMember("presidencia.macro@eafit.edu.co");
  await seedAppointment(presidentId, termId, "PRESIDENT");
  const eventId = await seedEvent("dias", "DÍAS");
  const pasada = await seedEdition(eventId, "dias-pasada", "Edición pasada", {
    startsAt: new Date(Date.now() - 40 * DAY),
    endsAt: new Date(Date.now() - 38 * DAY),
  });
  const siguiente = await seedEdition(eventId, "dias-siguiente", "Edición siguiente", {
    startsAt: new Date(Date.now() + 200 * DAY),
  });
  const generalId = await seedMember("general.macro@eafit.edu.co");
  const logisticaId = await seedMember("logistica.macro@eafit.edu.co");
  const nuevaId = await seedMember("nueva.macro@eafit.edu.co");
  await seedMacroeventDirector(generalId, termId, pasada, "GENERAL");
  await seedMacroeventDirector(logisticaId, termId, pasada, "LOGISTICA");
  await seedMacroeventDirector(nuevaId, termId, siguiente, "GENERAL");
  return {
    pasada,
    siguiente,
    president: { personId: presidentId, ip: null },
    general: { personId: generalId, ip: null },
    logistica: { personId: logisticaId, ip: null },
    nuevaId,
  };
}

describe("el seguimiento de un macroevento", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("la Presidencia guarda el plan del mes y la reunión con Desarrollo Estudiantil", async () => {
    const f = await setup();

    await expect(
      saveEditionEntryAs(f.general, { editionId: f.pasada, kind: "EDITION_PLAN", answers: ["x"] }),
    ).rejects.toThrow(tList("T-5129")[0] ?? "");
    await saveEditionEntryAs(f.president, {
      editionId: f.pasada,
      kind: "EDITION_PLAN",
      answers: ["Cerrar patrocinios"],
    });
    await saveEditionEntryAs(f.president, {
      editionId: f.pasada,
      kind: "EDITION_MEETING",
      occurredOn: "2026-11-10",
      answers: ["Va bien la logística"],
    });
    expect((await editionLog(f.pasada)).map((entry) => entry.kind).sort()).toEqual([
      "EDITION_MEETING",
      "EDITION_PLAN",
    ]);
  });

  it("cada cargo entrega su empalme con las preguntas generales y las suyas, y nadie más lo entrega", async () => {
    const f = await setup();
    await saveTemplateAs(f.president, {
      kind: "EDITION_HANDOVER",
      roleCode: "LOGISTICA",
      questions: ["¿Qué proveedores de sonido funcionaron?"],
    });

    await expect(
      saveEditionHandoverAs(f.general, {
        editionId: f.pasada,
        roleCode: "LOGISTICA",
        answers: ["x"],
      }),
    ).rejects.toThrow(guard(1));

    const generales = tList("T-5128");
    const respuestas = generales.map(() => "");
    respuestas[generales.length] = "El de siempre, con contrato firmado";
    await saveEditionHandoverAs(f.logistica, {
      editionId: f.pasada,
      roleCode: "LOGISTICA",
      answers: respuestas,
    });
    const logistica = (await editionHandovers(f.pasada)).find(
      (item) => item.roleCode === "LOGISTICA",
    );
    expect(logistica?.entry?.answers.at(-1)).toEqual({
      question: "¿Qué proveedores de sonido funcionaron?",
      answer: "El de siempre, con contrato firmado",
    });
  });

  it("sin todos los empalmes no se cierra; con todos, sí, y después no se escribe más", async () => {
    const f = await setup();
    expect((await editionsPendingClosure()).map((row) => row.id)).toEqual([f.pasada]);

    await saveEditionHandoverAs(f.general, {
      editionId: f.pasada,
      roleCode: "GENERAL",
      answers: ["Empezar la convocatoria antes"],
    });
    await expect(closeEditionFollowUpAs(f.president, f.pasada)).rejects.toThrow(
      guard(2).replace("{cargos}", "Dirección de Logística"),
    );

    await saveEditionHandoverAs(f.logistica, {
      editionId: f.pasada,
      roleCode: "LOGISTICA",
      answers: ["Reservar el coliseo con tiempo"],
    });
    await expect(closeEditionFollowUpAs(f.general, f.pasada)).rejects.toThrow(
      tList("T-5129")[0] ?? "",
    );
    await closeEditionFollowUpAs(f.president, f.pasada);
    expect(await editionClosure(f.pasada)).not.toBeNull();
    expect(await editionsPendingClosure()).toEqual([]);
    await expect(
      saveEditionHandoverAs(f.general, {
        editionId: f.pasada,
        roleCode: "GENERAL",
        answers: ["Otra"],
      }),
    ).rejects.toThrow(guard(0));
  });

  it("la mesa de la edición siguiente recibe en Mi OE el empalme de su cargo", async () => {
    const f = await setup();
    await saveEditionHandoverAs(f.general, {
      editionId: f.pasada,
      roleCode: "GENERAL",
      answers: ["Empezar la convocatoria antes"],
    });

    const [mine] = await myEditionHandovers(f.nuevaId);
    expect(mine).toMatchObject({
      editionId: f.siguiente,
      roleCode: "GENERAL",
      receivedLabel: "DÍAS · Edición pasada",
      entry: null,
      closed: false,
    });
    expect(mine?.received?.answers[0]?.answer).toBe("Empezar la convocatoria antes");
  });
});
