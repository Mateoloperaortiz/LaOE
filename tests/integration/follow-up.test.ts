import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  assignCompanionAs,
  listCommitteeLog,
  listCompanions,
  saveCapEntryAs,
  saveTemplateAs,
  templateQuestions,
} from "@/modules/permanence";
import { followUpEntry } from "@/modules/permanence/schema";
import { tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import {
  seedAppointment,
  seedCommittee,
  seedMember,
  seedTerm,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { truncateAll } from "./db";

// La bitácora del CAP (ADR-197 regla 4): la Presidencia asigna un acompañante del CAP a cada comité;
// el acompañante (o la Presidencia) guarda el plan del mes y una nota por reunión, con las preguntas
// de plantillas que la Presidencia cambia sin código. Lo escrito guarda las preguntas como estaban.

const guard = (index: number) => tList("T-5129")[index] ?? "";

async function setup() {
  const termId = await seedTerm();
  const comite = await seedCommittee("pixel", "PIXEL");
  const presidentId = await seedMember("presidencia.cap@eafit.edu.co");
  await seedAppointment(presidentId, termId, "PRESIDENT");
  const cap = await seedWorkGroup(termId, "CAP", {
    kind: "WORK_COMMITTEE",
    code: "CAP",
    leaderPersonId: presidentId,
  });
  const companionId = await seedMember("acompanante.cap@eafit.edu.co");
  await seedWorkGroupMembership(cap, companionId);
  const otherCapId = await seedMember("otro.cap@eafit.edu.co");
  await seedWorkGroupMembership(cap, otherCapId);
  const outsiderId = await seedMember("fuera.cap@eafit.edu.co");
  return {
    termId,
    comite,
    president: { personId: presidentId, ip: null },
    companion: { personId: companionId, ip: null },
    otherCap: { personId: otherCapId, ip: null },
    companionId,
    outsiderId,
  };
}

describe("los acompañantes del CAP", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("los asigna la Presidencia, y solo entre quienes están en el CAP", async () => {
    const f = await setup();

    await expect(assignCompanionAs(f.companion, f.comite, f.companionId)).rejects.toThrow(guard(0));
    await expect(assignCompanionAs(f.president, f.comite, f.outsiderId)).rejects.toThrow(guard(1));

    await assignCompanionAs(f.president, f.comite, f.companionId);
    expect((await listCompanions(f.termId)).get(f.comite)).toBe(f.companionId);

    await assignCompanionAs(f.president, f.comite, null);
    expect((await listCompanions(f.termId)).has(f.comite)).toBe(false);
  });
});

describe("la bitácora de un comité", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("el acompañante guarda el plan del mes, uno por mes, con las preguntas como estaban", async () => {
    const f = await setup();
    await assignCompanionAs(f.president, f.comite, f.companionId);
    const preguntas = await templateQuestions("CAP_PLAN");
    expect(preguntas).toEqual(tList("T-5124"));

    await expect(
      saveCapEntryAs(f.otherCap, { committeeId: f.comite, kind: "CAP_PLAN", answers: ["x"] }),
    ).rejects.toThrow(guard(2));
    await expect(
      saveCapEntryAs(f.companion, { committeeId: f.comite, kind: "CAP_PLAN", answers: ["", " "] }),
    ).rejects.toThrow(guard(3));

    const { id } = await saveCapEntryAs(f.companion, {
      committeeId: f.comite,
      kind: "CAP_PLAN",
      answers: ["Cerrar la convocatoria"],
    });
    // Cambiar la plantilla no cambia lo ya escrito; guardar el plan otra vez lo reemplaza.
    await saveTemplateAs(f.president, { kind: "CAP_PLAN", questions: ["¿Qué sigue?"] });
    const again = await saveCapEntryAs(f.companion, {
      committeeId: f.comite,
      kind: "CAP_PLAN",
      answers: ["Abrir la convocatoria"],
    });
    expect(again.id).toBe(id);
    const [plan] = await getDb().select().from(followUpEntry).where(eq(followUpEntry.id, id));
    expect(plan).toMatchObject({ month: todayKey().slice(0, 7), committeeId: f.comite });
    expect(plan?.answers).toEqual([{ question: "¿Qué sigue?", answer: "Abrir la convocatoria" }]);
  });

  it("las notas de reunión se suman, y la Presidencia también escribe", async () => {
    const f = await setup();
    await assignCompanionAs(f.president, f.comite, f.companionId);

    await saveCapEntryAs(f.companion, {
      committeeId: f.comite,
      kind: "CAP_MEETING",
      occurredOn: "2026-11-10",
      answers: ["Ya tienen el aval del evento"],
    });
    await saveCapEntryAs(f.president, {
      committeeId: f.comite,
      kind: "CAP_MEETING",
      occurredOn: "2026-11-12",
      answers: ["", "La mesa se organizó bien"],
    });

    const log = await listCommitteeLog(f.comite);
    expect(log.map((entry) => entry.occurredOn)).toEqual(["2026-11-12", "2026-11-10"]);
    expect(log[0]?.answers[1]).toEqual({
      question: tList("T-5125")[1],
      answer: "La mesa se organizó bien",
    });
  });

  it("solo la Presidencia cambia las preguntas", async () => {
    const f = await setup();

    await expect(
      saveTemplateAs(f.companion, { kind: "CAP_MEETING", questions: ["¿Algo más?"] }),
    ).rejects.toThrow(guard(0));
    await saveTemplateAs(f.president, { kind: "CAP_MEETING", questions: ["¿Algo más?"] });
    expect(await templateQuestions("CAP_MEETING")).toEqual(["¿Algo más?"]);
  });
});
