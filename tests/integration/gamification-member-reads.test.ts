import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  getChallengeForMember,
  listBoosterTargetsForMember,
  listChallengesForMember,
  nextChallengeForMember,
} from "@/modules/participation";
import { committeeMembership } from "@/modules/people/schema";
import {
  seedChallenge,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedParticipation,
  seedPerson,
  seedQuestion,
  seedTerm,
  seedVeteran,
} from "../factories";
import { truncateAll } from "./db";

// Lo que un miembro ve de los retos (ADR-067 regla 2, ADR-122 regla 6): la lista, «el siguiente reto»,
// los destinos de un booster y el detalle salen por el público de cada reto, que el dominio resuelve
// con el término del reto. Las lecturas se piden como las piden las páginas de Mi OE, con el reloj
// inyectado.

const HOUR = 3_600_000;

/** Lo que la persona ve de los retos de un término: la lista, el siguiente y los destinos de un booster. */
async function seenBy(personId: string, termId: string, now: Date) {
  const list = await listChallengesForMember(personId, termId, now);
  const next = await nextChallengeForMember(personId, termId, now);
  const targets = await listBoosterTargetsForMember(personId, termId, now);
  return {
    list: list.map((card) => card.title),
    next: next?.title ?? null,
    targets: targets.challenges.map((card) => card.title),
  };
}

/** El detalle de un reto como lo pide su página: el reto y la persona, sin contexto armado afuera. */
function detailFor(challengeId: string, personId: string, now: Date) {
  return getChallengeForMember(challengeId, personId, now);
}

describe("retos: lo que ve un miembro en el término vigente", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("la lista, el siguiente reto, los destinos de un booster y el detalle salen por el público de cada quien", async () => {
    const now = new Date();
    const closesIn = (hours: number) => new Date(now.getTime() + hours * HOUR);
    const termId = await seedTerm();
    const gh = await seedCommittee("gh");
    const mercadeo = await seedCommittee("mercadeo");
    const veterano = await seedVeteran("lecturas.veterano@eafit.edu.co");
    await seedCommitteeMembership(veterano, gh, termId);
    const nuevo = await seedMember("lecturas.nuevo@eafit.edu.co");

    const paraGh = await seedChallenge(termId, {
      title: "Para GH",
      audience: "COMMITTEES",
      audienceCommitteeIds: [gh],
      closesAt: closesIn(1),
    });
    const paraMercadeo = await seedChallenge(termId, {
      title: "Para Mercadeo",
      audience: "COMMITTEES",
      audienceCommitteeIds: [mercadeo],
      closesAt: closesIn(2),
    });
    await seedChallenge(termId, { title: "Para nuevos", audience: "NEW", closesAt: closesIn(3) });
    await seedChallenge(termId, {
      title: "Para veteranos",
      audience: "VETERAN",
      closesAt: closesIn(4),
    });
    await seedChallenge(termId, { title: "Para todos", closesAt: closesIn(5) });
    await seedChallenge(termId, { title: "Sin premio", basePoints: 0, closesAt: closesIn(6) });
    await seedChallenge(termId, {
      title: "Programado",
      opensAt: closesIn(7),
      closesAt: closesIn(8),
    });

    expect(await seenBy(veterano, termId, now)).toEqual({
      list: ["Para GH", "Para veteranos", "Para todos", "Sin premio", "Programado"],
      next: "Para GH",
      targets: ["Para GH", "Para veteranos", "Para todos", "Programado"],
    });
    expect(await seenBy(nuevo, termId, now)).toEqual({
      list: ["Para nuevos", "Para todos", "Sin premio", "Programado"],
      next: "Para nuevos",
      targets: ["Para nuevos", "Para todos", "Programado"],
    });

    expect((await detailFor(paraGh, veterano, now))?.title).toBe("Para GH");
    expect(await detailFor(paraMercadeo, veterano, now)).toBeNull();
    expect(await detailFor(paraGh, nuevo, now)).toBeNull();
  });

  it("sin membresía, o con la membresía de baja, no hay retos, ni siguiente, ni destinos, ni detalle", async () => {
    const now = new Date();
    const termId = await seedTerm();
    const sinMembresia = await seedPerson("lecturas.sin@eafit.edu.co");
    const deBaja = await seedPerson("lecturas.baja@eafit.edu.co");
    await seedMembership(deBaja, termId, "INACTIVE");
    const paraTodos = await seedChallenge(termId, { title: "Para todos" });

    const nothing = { list: [], next: null, targets: [] };
    expect(await seenBy(sinMembresia, termId, now)).toEqual(nothing);
    expect(await seenBy(deBaja, termId, now)).toEqual(nothing);
    expect(await detailFor(paraTodos, sinMembresia, now)).toBeNull();
    expect(await detailFor(paraTodos, deBaja, now)).toBeNull();
  });
});

describe("retos: el detalle de un reto por comités de un término anterior (DT-031)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  /** Una trivia de GH del término anterior, ya cerrada, con quien participó y con quien llegó después. */
  async function closedCommitteeChallenge() {
    const now = new Date();
    const oldTermId = await seedTerm("2025-1");
    const termId = await seedTerm();
    const gh = await seedCommittee("gh");
    const mercadeo = await seedCommittee("mercadeo");
    // Era de GH en el término del reto y participó; en el vigente está en Mercadeo.
    const participant = await seedVeteran("lecturas.cambio@eafit.edu.co");
    await seedCommitteeMembership(participant, gh, oldTermId);
    await seedCommitteeMembership(participant, mercadeo, termId);
    // Entró a GH en el término vigente: el reto nunca fue para ella.
    const newcomer = await seedVeteran("lecturas.despues@eafit.edu.co");
    await seedCommitteeMembership(newcomer, gh, termId);
    const challengeId = await seedChallenge(oldTermId, {
      title: "Trivia de GH del término anterior",
      audience: "COMMITTEES",
      audienceCommitteeIds: [gh],
      opensAt: new Date("2025-03-01T15:00:00.000Z"),
      closesAt: new Date("2025-03-02T15:00:00.000Z"),
    });
    await seedQuestion(challengeId);
    await seedParticipation(challengeId, participant, {
      status: "COMPLETED",
      submittedAt: new Date("2025-03-01T16:00:00.000Z"),
      answers: [0],
      score: 1,
      passed: true,
    });
    return { now, challengeId, participant, newcomer };
  }

  it("quien era de su público y participó lo sigue viendo aunque haya cambiado de comité", async () => {
    const f = await closedCommitteeChallenge();

    const detail = await detailFor(f.challengeId, f.participant, f.now);

    expect(detail?.title).toBe("Trivia de GH del término anterior");
    expect(detail?.state).toBe("CLOSED");
    expect(detail?.participation?.status).toBe("COMPLETED");
  });

  it("quien entró a ese comité después no lo ve, ni sus respuestas: no era su público", async () => {
    const f = await closedCommitteeChallenge();

    const detail = await detailFor(f.challengeId, f.newcomer, f.now);

    expect(detail?.questions.map((question) => question.correctIndex)).toBeUndefined();
    expect(detail).toBeNull();
  });

  it("quien salió del comité a mitad de término deja de ver el reto que ya entregó (decisión abierta 69)", async () => {
    const now = new Date();
    const termId = await seedTerm();
    const gh = await seedCommittee("gh");
    const personId = await seedVeteran("lecturas.salio@eafit.edu.co");
    const membershipId = await seedCommitteeMembership(personId, gh, termId);
    const challengeId = await seedChallenge(termId, {
      title: "Para GH",
      audience: "COMMITTEES",
      audienceCommitteeIds: [gh],
    });
    await seedParticipation(challengeId, personId, { status: "COMPLETED" });
    expect((await detailFor(challengeId, personId, now))?.participation?.status).toBe("COMPLETED");

    await getDb()
      .update(committeeMembership)
      .set({ leftAt: now })
      .where(eq(committeeMembership.id, membershipId));

    // Conducta de hoy, que el ciclo 10 conservó: el público se evalúa en vivo también para mirar.
    expect(await detailFor(challengeId, personId, now)).toBeNull();
    expect((await seenBy(personId, termId, now)).list).toEqual([]);
  });
});
