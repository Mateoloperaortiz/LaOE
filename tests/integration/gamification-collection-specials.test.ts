import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { collectionFor } from "@/modules/participation";
import { achievement, badgeDefinition } from "@/modules/participation/schema";
import { countQueries } from "../helpers/queries";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedOccasion, seedTerm } from "./factories";

// Ediciones especiales en la colección (ADR-067 regla 9): cada una sale con el título de la ocasión
// o del reto que la sostiene. Lo que la colección devuelve de ellas se fija primero, y después
// cuántas consultas le cuesta (DT-294).

const db = () => getDb();

let badgeCounter = 0;

type Target = { occasionId: string } | { challengeId: string };

/** Una edición especial y, si se pide, el logro de la persona sobre ella. */
async function seedSpecial(
  target: Target,
  holder: {
    personId: string;
    termId: string;
    revoked?: boolean;
  } | null,
  overrides: { active?: boolean } = {},
): Promise<string> {
  badgeCounter += 1;
  const code = `especial-${String(badgeCounter).padStart(3, "0")}`;
  const [badge] = await db()
    .insert(badgeDefinition)
    .values({
      code,
      family: "SPECIAL",
      threshold: null,
      name: `Edición especial ${badgeCounter}`,
      active: overrides.active ?? true,
      specialOccasionId: "occasionId" in target ? target.occasionId : null,
      specialChallengeId: "challengeId" in target ? target.challengeId : null,
    })
    .returning({ id: badgeDefinition.id });
  if (holder) {
    await db()
      .insert(achievement)
      .values({
        personId: holder.personId,
        badgeId: badge?.id ?? "",
        termId: holder.termId,
        sourceKind: "MANUAL",
        revokedAt: holder.revoked ? new Date() : null,
        revokeReason: holder.revoked ? "Retiro de prueba" : null,
      });
  }
  return code;
}

const summary = (collection: Awaited<ReturnType<typeof collectionFor>>) =>
  collection.specials
    .map((item) => [item.badge.code, item.origin, item.achievement.badgeId === item.badge.id])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

describe("colección: ediciones especiales con su origen", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("cada especial viva sale con el título de su ocasión o de su reto; la revocada, la inactiva y la ajena no salen", async () => {
    const termId = await seedTerm();
    const oldTermId = await seedTerm("2019-1");
    const personId = await seedMember("especiales1@test.dev");
    const otherId = await seedMember("especiales2@test.dev");
    const welcome = await seedOccasion(termId, { title: "Asamblea de bienvenida" });
    const closing = await seedOccasion(oldTermId, { title: "Cierre del semestre viejo" });
    const quiz = await seedChallenge(termId, { title: "Trivia de la casa" });

    const fromOccasion = await seedSpecial({ occasionId: welcome.id }, { personId, termId });
    const fromChallenge = await seedSpecial({ challengeId: quiz }, { personId, termId });
    const fromOldTerm = await seedSpecial(
      { occasionId: closing.id },
      { personId, termId: oldTermId },
    );
    await seedSpecial({ occasionId: welcome.id }, { personId, termId, revoked: true });
    await seedSpecial({ challengeId: quiz }, { personId, termId }, { active: false });
    await seedSpecial({ occasionId: closing.id }, { personId: otherId, termId });
    await seedSpecial({ challengeId: quiz }, null);

    expect(summary(await collectionFor(personId))).toEqual([
      [fromOccasion, "Asamblea de bienvenida", true],
      [fromChallenge, "Trivia de la casa", true],
      [fromOldTerm, "Cierre del semestre viejo", true],
    ]);
    // El filtro por semestre mira el término del logro, no el de la ocasión.
    expect(summary(await collectionFor(personId, { termId }))).toEqual([
      [fromOccasion, "Asamblea de bienvenida", true],
      [fromChallenge, "Trivia de la casa", true],
    ]);
    expect(summary(await collectionFor(personId, { termId: oldTermId }))).toEqual([
      [fromOldTerm, "Cierre del semestre viejo", true],
    ]);
  });

  it("quien no tiene ediciones especiales recibe la lista vacía", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("especiales3@test.dev");
    const welcome = await seedOccasion(termId, { title: "Asamblea de bienvenida" });
    await seedSpecial({ occasionId: welcome.id }, null);

    expect((await collectionFor(personId)).specials).toEqual([]);
  });
});

describe("colección: cuántas consultas cuestan las ediciones especiales (DT-294)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("hace las mismas consultas con dos especiales que con cinco", async () => {
    const termId = await seedTerm();
    const few = await seedMember("especiales4@test.dev");
    const many = await seedMember("especiales5@test.dev");
    const occasions = [
      await seedOccasion(termId, { title: "Ocasión uno" }),
      await seedOccasion(termId, { title: "Ocasión dos" }),
      await seedOccasion(termId, { title: "Ocasión tres" }),
    ];
    const challenges = [
      await seedChallenge(termId, { title: "Reto uno" }),
      await seedChallenge(termId, { title: "Reto dos" }),
    ];
    for (const item of occasions) {
      await seedSpecial({ occasionId: item.id }, { personId: many, termId });
    }
    for (const challengeId of challenges) {
      await seedSpecial({ challengeId }, { personId: many, termId });
    }
    await seedSpecial({ occasionId: occasions[0]?.id ?? "" }, { personId: few, termId });
    await seedSpecial({ challengeId: challenges[0] ?? "" }, { personId: few, termId });

    const withFew = await countQueries(() => collectionFor(few));
    const withMany = await countQueries(() => collectionFor(many));

    expect(withFew.result.specials).toHaveLength(2);
    expect(withMany.result.specials.map((item) => item.origin).sort()).toEqual([
      "Ocasión dos",
      "Ocasión tres",
      "Ocasión uno",
      "Reto dos",
      "Reto uno",
    ]);
    expect(withMany.queries.length).toBe(withFew.queries.length);
  });
});
