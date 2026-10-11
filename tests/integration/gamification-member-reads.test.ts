import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  getChallengeForMember,
  listBoosterTargetsForMember,
  listChallengesForMember,
  nextChallengeForMember,
  resolveMemberContext,
} from "@/modules/participation";
import { getCurrentTerm } from "@/modules/terms";
import { truncateAll } from "./db";
import {
  seedChallenge,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
  seedVeteran,
} from "./factories";

// Lo que un miembro ve de los retos (ADR-067 regla 2): la lista, «el siguiente reto», los destinos de
// un booster y el detalle salen por el público de cada reto. Las lecturas se piden como las piden las
// páginas de Mi OE, con el reloj inyectado.

const HOUR = 3_600_000;

/** Lo que la persona ve de los retos de un término: la lista, el siguiente y los destinos de un booster. */
async function seenBy(personId: string, termId: string, now: Date) {
  const member = await resolveMemberContext(personId, termId);
  const list = await listChallengesForMember(personId, termId, member, now);
  const next = await nextChallengeForMember(personId, termId, member, now);
  const targets = await listBoosterTargetsForMember(personId, termId, member, now);
  return {
    list: list.map((card) => card.title),
    next: next?.title ?? null,
    targets: targets.challenges.map((card) => card.title),
  };
}

/** El detalle de un reto como lo pide su página. */
async function detailFor(challengeId: string, personId: string, now: Date) {
  const term = await getCurrentTerm(now);
  const member = term ? await resolveMemberContext(personId, term.id) : null;
  return getChallengeForMember(challengeId, personId, member, now);
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
