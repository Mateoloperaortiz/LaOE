import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { finishSudokuAs, startSudokuAs } from "@/modules/participation/domain/sudoku";
import {
  achievement,
  badgeDefinition,
  challengeEvidenceFile,
  reward,
  sudokuRun,
} from "@/modules/participation/schema";
import { truncateAll } from "./db";
import { seedBooster, seedChallenge, seedMember, seedParticipation, seedTerm } from "./factories";

// "Mis datos" (ADR-034 regla 12, ADR-067 regla 16): el export incluye la actividad de la
// gamificación — entregas, evidencias, boosters, logros y premios — sin los campos internos
// (`requestId`, `objectKey`) ni la posición correcta de la trivia (`correctIndex`).

const db = () => getDb();
let currentPerson = "";

vi.mock("@/modules/identity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/identity")>();
  return {
    ...mod,
    getActor: () =>
      Promise.resolve({
        personId: currentPerson,
        sessionId: "sesion-test",
        email: "miembro@test.dev",
        name: "Miembro Sintético",
        firstName: "Miembro",
        membershipStatus: "ACTIVE" as const,
        permissions: [],
        otpVerifiedAt: new Date(),
        sessionLastSeenAt: new Date(),
      }),
  };
});

const { GET } = await import("@/app/api/mis-datos/route");

describe("mis datos: gamificación", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("incluye entregas, evidencias, boosters, logros y premios sin campos internos", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("misdatos.gam@test.dev");
    currentPerson = personId;

    const challengeId = await seedChallenge(termId, { kind: "EVIDENCE", passPercent: null });
    const participationId = await seedParticipation(challengeId, personId, {
      status: "COMPLETED",
      evidenceText: "Fui a la actividad de prueba.",
      answers: [1, 0, 2],
      score: 3,
    });
    await db()
      .insert(challengeEvidenceFile)
      .values({
        participationId,
        ordinal: 1,
        objectKey: `evidence/${personId}/aaaaaaaaaa.webp`,
        contentType: "image/webp",
        byteSize: 10_000,
        status: "READY",
      });
    await db().insert(reward).values({
      personId,
      termId,
      source: "CHALLENGE",
      participationId,
      basePoints: 10,
      baseGranted: 10,
      extraPoints: 5,
      status: "GRANTED",
      dayKey: "2026-08-10",
      weekKey: "2026-08-10",
      capDaily: 20,
      capWeekly: 60,
      decidedAt: new Date(),
    });
    await seedBooster(personId, termId, "PLUS_50");
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
      });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    expect(Array.isArray(body.challengeParticipations)).toBe(true);
    const entregas = body.challengeParticipations as Array<Record<string, unknown>>;
    expect(entregas).toHaveLength(1);
    expect(entregas[0]).toMatchObject({
      challengeId,
      status: "COMPLETED",
      answers: [1, 0, 2],
      score: 3,
      evidenceText: "Fui a la actividad de prueba.",
    });

    expect(Array.isArray(body.evidenceFiles)).toBe(true);
    const archivos = body.evidenceFiles as Array<Record<string, unknown>>;
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toMatchObject({ participationId, ordinal: 1, status: "READY" });

    expect(Array.isArray(body.boosters)).toBe(true);
    expect((body.boosters as unknown[]).length).toBe(1);
    expect(Array.isArray(body.achievements)).toBe(true);
    expect((body.achievements as Array<Record<string, unknown>>)[0]).toMatchObject({
      historical: true,
      badge: { code: "EN_PARCHE_1", level: 1 },
    });
    expect(Array.isArray(body.rewards)).toBe(true);
    expect((body.rewards as Array<Record<string, unknown>>)[0]).toMatchObject({
      source: "CHALLENGE",
      status: "GRANTED",
      basePoints: 10,
      extraPoints: 5,
    });

    // Campos internos que no salen (privacidad y antitrampa).
    expect(serialized).not.toContain('"requestId"');
    expect(serialized).not.toContain('"objectKey"');
    expect(serialized).not.toContain('"correctIndex"');
    expect(serialized).not.toContain("evidence/");
  });

  it("incluye las partidas de Sudoku sin semilla, dadas ni solución (ADR-078 regla 17)", async () => {
    const personId = await seedMember("misdatos.sudoku@test.dev");
    currentPerson = personId;
    // Una resuelta con ayudas y otra abierta: ni la abierta lleva su tablero a la exportación.
    const resuelta = await startSudokuAs(
      { personId },
      { requestId: randomUUID(), difficulty: "EASY", assisted: true },
    );
    if (!resuelta.ok) throw new Error(resuelta.reason);
    const [fila] = await db().select().from(sudokuRun).where(eq(sudokuRun.id, resuelta.run.id));
    if (!fila) throw new Error("Partida de prueba ausente");
    const cierre = await finishSudokuAs(
      { personId },
      { runId: fila.id, grid: fila.solution, requestId: randomUUID() },
    );
    expect(cierre.ok).toBe(true);
    const abierta = await startSudokuAs(
      { personId },
      { requestId: randomUUID(), difficulty: "HARD", assisted: true },
    );
    if (!abierta.ok) throw new Error(abierta.reason);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sudokuRuns: Array<Record<string, unknown>> };
    expect(body.sudokuRuns).toHaveLength(2);
    expect(body.sudokuRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "SOLVED",
          difficulty: "EASY",
          assisted: true,
          points: 1,
        }),
        expect.objectContaining({ status: "IN_PROGRESS", difficulty: "HARD", points: 0 }),
      ]),
    );
    expect(Object.keys(body.sudokuRuns[0] ?? {}).sort()).toEqual(
      ["assisted", "day", "difficulty", "id", "points", "status"].sort(),
    );
    const partidas = await db().select().from(sudokuRun);
    const serialized = JSON.stringify(body);
    for (const partida of partidas) {
      expect(serialized).not.toContain(partida.seed);
      expect(serialized).not.toContain(partida.givens);
      expect(serialized).not.toContain(partida.solution);
    }
  });
});
