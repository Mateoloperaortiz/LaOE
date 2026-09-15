import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  achievementsResource,
  challengeParticipationsResource,
} from "@/modules/participation/admin";
import { achievement, badgeDefinition } from "@/modules/participation/schema";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedParticipation, seedTerm } from "./factories";

// Exportes personales de la gamificación (ADR-067 regla 16): "retos" lista entregas con premio e
// "insignias" los logros de la colección; ambos piden step-up (personalData) en la interfaz.

const db = () => getDb();

describe("exportes de gamificación", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("retos lista la entrega con su premio e insignias el logro con su persona", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("exportes@test.dev", {
      firstName: "Ada",
      lastName: "Sintética",
    });
    const challengeId = await seedChallenge(termId, {
      kind: "EVIDENCE",
      passPercent: null,
      title: "Misión de prueba",
    });
    await seedParticipation(challengeId, personId, { status: "COMPLETED" });

    const retos = await challengeParticipationsResource.list({
      q: "",
      filters: {},
      page: 1,
      pageSize: 10,
    });
    expect(retos.total).toBe(1);
    expect(retos.rows[0]).toMatchObject({
      challengeTitle: "Misión de prueba",
      personName: "Ada Sintética",
      email: "exportes@test.dev",
      status: "COMPLETED",
    });
    const exportada = retos.rows[0] && challengeParticipationsResource.exportRow(retos.rows[0]);
    expect(exportada).toMatchObject({
      reto: "Misión de prueba",
      persona: "Ada Sintética",
      correo: "exportes@test.dev",
    });

    const [badge] = await db()
      .select()
      .from(badgeDefinition)
      .where(eq(badgeDefinition.code, "EN_PARCHE_1"));
    await db()
      .insert(achievement)
      .values({
        personId,
        badgeId: badge?.id ?? "",
        termId,
        sourceKind: "CHECKIN",
        sourceRef: "ref-test",
        historical: true,
        unlockedAt: new Date("2023-03-10T15:00:00Z"),
      });

    const insignias = await achievementsResource.list({
      q: "",
      filters: {},
      page: 1,
      pageSize: 10,
    });
    expect(insignias.total).toBe(1);
    expect(insignias.rows[0]).toMatchObject({
      personName: "Ada Sintética",
      email: "exportes@test.dev",
      badgeCode: "EN_PARCHE_1",
      badgeName: "En parche",
      level: 1,
      historical: true,
      revokedAt: null,
    });
    const fila = insignias.rows[0] && achievementsResource.exportRow(insignias.rows[0]);
    expect(fila).toMatchObject({
      persona: "Ada Sintética",
      correo: "exportes@test.dev",
      insignia: "En parche",
      nivel: 1,
      historica: "si",
      revocada: null,
    });

    // Ambos exportes llevan datos personales: la interfaz los protege con step-up.
    expect(challengeParticipationsResource.personalData).toBe(true);
    expect(achievementsResource.personalData).toBe(true);
  });
});
