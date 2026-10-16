import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  adjustPointsAs,
  checkInSelfAs,
  closeOccasionAs,
  grantBoosterAs,
  rankCommittees,
  reverseEntryAs,
  setBoosterTargetAs,
  setGamificationEnabledAs,
  startColorAs,
  startGame2048As,
  startSudokuAs,
  submitTriviaAs,
} from "@/modules/participation";
import { creditGame } from "@/modules/participation/domain/ledger";
import { setCommitteeMembershipsAs } from "@/modules/people";
import { writeConfig } from "@/modules/system";
import { getTerm, lockOpenTermPoints } from "@/modules/terms";
import {
  seedChallenge,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedMemberships,
  seedOccasion,
  seedPanalGame,
  seedPeople,
  seedPerson,
  seedQuestion,
  seedTerm,
  seedWordleGame,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// ADR-136: el seam observado es el ranking público; los premios se escriben por sus comandos.
// shrinkK=0 es una configuración válida que permite usar ejemplos de asistencia literales.
const NOW = new Date("2026-10-16T15:00:00Z");
const JOINED = new Date("2026-07-01T05:00:00Z");

async function cohort(termId: string, slug: string, count = 1, joinedAt = JOINED) {
  const committeeId = await seedCommittee(slug);
  const people = await seedPeople(
    Array.from({ length: count }, (_, index) => ({ email: `${slug}-${index}@example.test` })),
  );
  await seedMemberships(people, termId);
  for (const personId of people) {
    await seedCommitteeMembership(personId, committeeId, termId, "MIEMBRO", {
      joinedAt,
    });
  }
  const member = people[0];
  if (!member) throw new Error("El comité sintético necesita una persona");
  return { committeeId, people, member };
}

async function adjust(personId: string, termId: string, points: number) {
  return adjustPointsAs(
    { personId, ip: null },
    { personId, termId, points, reason: "Corrección GH sintética" },
  );
}

function committee(ranking: Awaited<ReturnType<typeof rankCommittees>>, committeeId: string) {
  const result = ranking.find((item) => item.row.committeeId === committeeId);
  if (!result) throw new Error("Falta el comité esperado en el ranking público");
  return result;
}

async function attendAndClose(termId: string, attendees: string[]) {
  const occasion = await seedOccasion(termId, { points: 1 });
  for (const personId of attendees) {
    const result = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    if (!result.ok) throw new Error(`No se registró la asistencia sintética: ${result.reason}`);
  }
  await closeOccasionAs(SYSTEM_ACTOR, occasion.id);
  await drainOutbox();
}

async function gameCredit(input: Parameters<typeof creditGame>[1]) {
  // Mismo escritor de acreditación que los juegos; no se insertan entradas del ledger a mano.
  await runCommand({ personId: input.personId, ip: null }, async (ctx) => {
    await lockOpenTermPoints(ctx.tx, input.termId);
    await creditGame(ctx, input);
  });
}

describe("ranking combinado de comités por promedio GH y participación", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await truncateAll();
    await writeConfig(SYSTEM_ACTOR, "score.shrinkK", 0);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("deja vacío un roster sin hechos y conserva todos los comités reales al quedar un neto observado de cero", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "sin-hechos-a");
    const b = await cohort(termId, "sin-hechos-b");
    expect(await rankCommittees(termId)).toEqual([]);

    const entry = await adjust(a.member, termId, 10);
    const positive = await rankCommittees(termId);
    expect(positive).toHaveLength(2);
    expect(committee(positive, a.committeeId)).toMatchObject({
      rank: 1,
      row: { rankingMetric: "COMBINED", ghTotal: 10, ghAverage: 10, score: 0.5 },
    });
    expect(committee(positive, b.committeeId)).toMatchObject({
      rank: 2,
      row: { ghTotal: 0, ghAverage: 0, activeMembers: 1, score: 0 },
    });

    await reverseEntryAs({ personId: a.member, ip: null }, entry.id, "Se anuló el ajuste");
    const zero = await rankCommittees(termId);
    expect(zero).toHaveLength(2);
    for (const id of [a.committeeId, b.committeeId]) {
      expect(committee(zero, id)).toMatchObject({
        rank: 1,
        row: { ghTotal: 0, ghAverage: 0, ghNormalized: 0, score: 0 },
      });
    }
  });

  it("da el mismo componente GH a 20 integrantes con 400 puntos y a 10 con 200, incluyendo los saldos cero", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "veinte", 20);
    const b = await cohort(termId, "diez", 10);
    await adjust(a.member, termId, 400);
    await adjust(b.member, termId, 200);
    const ranking = await rankCommittees(termId);
    expect(committee(ranking, a.committeeId)).toMatchObject({
      rank: 1,
      row: { ghTotal: 400, activeMembers: 20, ghAverage: 20, ghNormalized: 1, score: 0.5 },
    });
    expect(committee(ranking, b.committeeId)).toMatchObject({
      rank: 1,
      row: { ghTotal: 200, activeMembers: 10, ghAverage: 20, ghNormalized: 1, score: 0.5 },
    });
  });

  it("con asistencia igual ordena por promedio GH y conserva ambos pesos de la política", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "asistencia-igual-a");
    const b = await cohort(termId, "asistencia-igual-b");
    await attendAndClose(termId, [a.member, b.member]);
    await adjust(a.member, termId, 39);
    await adjust(b.member, termId, 19);
    const ranking = await rankCommittees(termId);
    expect(committee(ranking, a.committeeId)).toMatchObject({
      rank: 1,
      row: {
        score: 1,
        ghAverage: 40,
        attendanceScore: 1,
        attendanceNormalized: 1,
        policy: {
          version: "GH_ATTENDANCE_50_50_V1",
          effectiveAt: NOW.toISOString(),
          ghWeight: 0.5,
          attendanceWeight: 0.5,
          ghAverageMax: 40,
          attendanceMax: 1,
        },
      },
    });
    expect(committee(ranking, b.committeeId)).toMatchObject({
      rank: 2,
      row: { score: 0.75, ghAverage: 20, ghNormalized: 0.5, attendanceScore: 1 },
    });
  });

  it("comparte el puesto 75/75 sin desempatar otra vez por GH o asistencia", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "empate-a");
    const b = await cohort(termId, "empate-b");
    await attendAndClose(termId, [a.member, b.member]);
    await attendAndClose(termId, [a.member]);
    await adjust(a.member, termId, 18);
    await adjust(b.member, termId, 39);
    const ranking = await rankCommittees(termId);
    expect(committee(ranking, a.committeeId)).toMatchObject({
      rank: 1,
      row: { score: 0.75, ghAverage: 20, ghNormalized: 0.5, attendanceNormalized: 1 },
    });
    expect(committee(ranking, b.committeeId)).toMatchObject({
      rank: 1,
      row: { score: 0.75, ghAverage: 40, ghNormalized: 1, attendanceNormalized: 0.5 },
    });
  });

  it("sin asistencia el mejor GH aporta 50 y sin GH la mejor asistencia también aporta 50", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "una-dimension-a");
    const b = await cohort(termId, "una-dimension-b");
    const aEntry = await adjust(a.member, termId, 40);
    const bEntry = await adjust(b.member, termId, 20);
    const ghOnly = await rankCommittees(termId);
    expect(committee(ghOnly, a.committeeId).row).toMatchObject({
      score: 0.5,
      attendanceNormalized: 0,
      policy: { attendanceMax: 0 },
    });
    expect(committee(ghOnly, b.committeeId).row.score).toBe(0.25);

    await reverseEntryAs({ personId: a.member, ip: null }, aEntry.id, "Retiro del ajuste");
    await reverseEntryAs({ personId: b.member, ip: null }, bEntry.id, "Retiro del ajuste");
    await attendAndClose(termId, [a.member]);
    await adjust(a.member, termId, -1);
    const attendanceOnly = await rankCommittees(termId);
    expect(committee(attendanceOnly, a.committeeId).row).toMatchObject({
      score: 0.5,
      ghAverage: 0,
      ghNormalized: 0,
      attendanceNormalized: 1,
      policy: { ghAverageMax: 0 },
    });
    expect(committee(attendanceOnly, b.committeeId).row.score).toBe(0);
  });

  it("muestra el promedio negativo con signo pero normaliza a cero si ningún promedio es positivo", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "negativo-a");
    const b = await cohort(termId, "negativo-b");
    await adjust(a.member, termId, -5);
    await adjust(b.member, termId, -10);
    const ranking = await rankCommittees(termId);
    expect(committee(ranking, a.committeeId)).toMatchObject({
      rank: 1,
      row: { ghTotal: -5, ghAverage: -5, ghNormalized: 0, score: 0, policy: { ghAverageMax: 0 } },
    });
    expect(committee(ranking, b.committeeId)).toMatchObject({
      rank: 1,
      row: { ghTotal: -10, ghAverage: -10, ghNormalized: 0, score: 0 },
    });
    await adjust(b.member, termId, 20);
    const positiveMaximum = await rankCommittees(termId);
    expect(committee(positiveMaximum, a.committeeId).row).toMatchObject({
      ghAverage: -5,
      ghNormalized: 0,
      score: 0,
    });
    expect(committee(positiveMaximum, b.committeeId).row).toMatchObject({
      ghAverage: 10,
      ghNormalized: 1,
      score: 0.5,
    });
  });

  it("suma asistencia, trivia e impulso GH y refleja ajustes positivos, negativos y su reversión en el puesto", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "fuentes-a");
    const b = await cohort(termId, "fuentes-b");
    const actor = { personId: a.member, ip: null };
    await adjust(b.member, termId, 10);
    await setGamificationEnabledAs(actor, true);
    const occasion = await seedOccasion(termId, { points: 1 });
    const registered = await checkInSelfAs(actor, { publicId: occasion.publicId });
    expect(registered.ok).toBe(true);
    const challengeId = await seedChallenge(termId, { basePoints: 5 });
    await seedQuestion(challengeId);
    const booster = await grantBoosterAs(actor, {
      personId: a.member,
      termId,
      kind: "PLUS_50",
      reason: "Impulso GH sintético",
    });
    await setBoosterTargetAs(actor, { boosterId: booster.id, target: { challengeId } });
    const answered = await submitTriviaAs(actor, {
      challengeId,
      requestId: randomUUID(),
      answers: [0],
    });
    expect(answered.ok).toBe(true);
    expect(committee(await rankCommittees(termId), a.committeeId)).toMatchObject({
      rank: 2,
      row: { ghTotal: 8, ghAverage: 8, score: 0.4, occasions: 0 },
    });

    const positive = await adjust(a.member, termId, 5);
    expect(committee(await rankCommittees(termId), a.committeeId)).toMatchObject({
      rank: 1,
      row: { ghTotal: 13, score: 0.5 },
    });
    await adjust(a.member, termId, -4);
    expect(committee(await rankCommittees(termId), a.committeeId)).toMatchObject({
      rank: 2,
      row: { ghTotal: 9, score: 0.45 },
    });
    await reverseEntryAs(actor, positive.id, "Se revierte el ajuste positivo");
    expect(committee(await rankCommittees(termId), a.committeeId)).toMatchObject({
      rank: 2,
      row: { ghTotal: 4, ghAverage: 4, score: 0.2 },
    });
  });

  it("usa sólo integrantes ACTIVE con pertenencia viva y excluye comités sin activos", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "poblacion", 2);
    await adjust(a.member, termId, 10);
    for (const status of ["ON_LEAVE", "HONORARY", "INACTIVE"] as const) {
      const personId = await seedPerson(`${status.toLowerCase()}@example.test`, {
        stage: status === "INACTIVE" ? "ALUMNI" : "MEMBER",
      });
      await seedMembership(personId, termId, status);
      await seedCommitteeMembership(personId, a.committeeId, termId);
      await adjust(personId, termId, 100);
    }
    for (const [email, dates] of [
      ["pertenencia-cerrada@example.test", { joinedAt: JOINED, leftAt: NOW }],
      ["pertenencia-futura@example.test", { joinedAt: new Date(NOW.getTime() + 1) }],
    ] as const) {
      const personId = await seedPerson(email);
      await seedMembership(personId, termId);
      await seedCommitteeMembership(personId, a.committeeId, termId, "MIEMBRO", dates);
      await adjust(personId, termId, 100);
    }
    await seedCommittee("sin-integrantes");
    const inactive = await seedCommittee("comite-inactivo", "Comité inactivo", {
      status: "INACTIVE",
    });
    await seedCommitteeMembership(a.member, inactive, termId);
    const ranking = await rankCommittees(termId);
    expect(ranking).toHaveLength(1);
    expect(committee(ranking, a.committeeId).row).toMatchObject({
      activeMembers: 2,
      ghTotal: 10,
      ghAverage: 5,
    });
  });

  it("atribuye el saldo completo a cada comité actual y lo mueve completo con una transferencia", async () => {
    const termId = await seedTerm("2026-2");
    const a = await cohort(termId, "traslado-a");
    const b = await seedCommittee("traslado-b");
    const c = await cohort(termId, "traslado-c");
    await seedCommitteeMembership(a.member, b, termId, "MIEMBRO", { joinedAt: JOINED });
    await adjust(a.member, termId, 30);
    const before = await rankCommittees(termId);
    expect(committee(before, a.committeeId).row).toMatchObject({ ghTotal: 30, ghAverage: 30 });
    expect(committee(before, b).row).toMatchObject({ ghTotal: 30, ghAverage: 30 });
    expect(committee(before, c.committeeId).row).toMatchObject({ ghTotal: 0, ghAverage: 0 });

    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
    await setCommitteeMembershipsAs({ personId: a.member, ip: null }, a.member, termId, [
      { committeeId: b },
      { committeeId: c.committeeId },
    ]);
    const after = await rankCommittees(termId);
    expect(after).toHaveLength(2);
    expect(after.some((item) => item.row.committeeId === a.committeeId)).toBe(false);
    expect(committee(after, b).row).toMatchObject({ ghTotal: 30, activeMembers: 1, ghAverage: 30 });
    expect(committee(after, c.committeeId).row).toMatchObject({
      ghTotal: 30,
      activeMembers: 2,
      ghAverage: 15,
      policy: { effectiveAt: "2026-10-17T15:00:00.000Z" },
    });
  });

  it("acota la población al último instante del término aunque los puntos sigan abiertos después", async () => {
    vi.setSystemTime(new Date("2027-01-10T15:00:00Z"));
    const termId = await seedTerm("2026-2");
    const committeeId = await seedCommittee("corte-final");
    const end = new Date("2027-01-01T04:59:59.999Z");
    const before = await seedPerson("corte-incluido@example.test");
    const future = await seedPerson("corte-posterior@example.test");
    const left = await seedPerson("corte-salio@example.test");
    await seedMemberships([before, future, left], termId);
    await seedCommitteeMembership(before, committeeId, termId, "MIEMBRO", { joinedAt: end });
    await seedCommitteeMembership(future, committeeId, termId, "MIEMBRO", {
      joinedAt: new Date(end.getTime() + 1),
    });
    await seedCommitteeMembership(left, committeeId, termId, "MIEMBRO", {
      joinedAt: JOINED,
      leftAt: end,
    });
    await adjust(before, termId, 10);
    await adjust(future, termId, 100);
    await adjust(left, termId, 100);
    expect(committee(await rankCommittees(termId), committeeId).row).toMatchObject({
      ghTotal: 10,
      activeMembers: 1,
      ghAverage: 10,
      policy: { effectiveAt: "2027-01-01T04:59:59.999Z" },
    });
  });

  it("usa el inicio del término como corte inferior antes de que empiece el semestre", async () => {
    vi.setSystemTime(new Date("2026-06-15T15:00:00Z"));
    const termId = await seedTerm("2026-2");
    const start = new Date("2026-07-01T05:00:00Z");
    const a = await cohort(termId, "corte-inicial-a", 1, start);
    const b = await cohort(termId, "corte-inicial-b", 1, new Date(start.getTime() + 1));
    await adjust(a.member, termId, 10);
    await adjust(b.member, termId, 100);
    const ranking = await rankCommittees(termId);
    expect(ranking).toHaveLength(1);
    expect(committee(ranking, a.committeeId).row).toMatchObject({
      ghTotal: 10,
      activeMembers: 1,
      ghAverage: 10,
      policy: { effectiveAt: "2026-07-01T05:00:00.000Z" },
    });
  });

  it("excluye cada crédito nativo de los cinco juegos incluso con la política personal histórica mixta", async () => {
    vi.setSystemTime(new Date("2025-10-16T15:00:00Z"));
    const termId = await seedTerm("2025-2");
    const joinedAt = new Date("2025-07-01T05:00:00Z");
    const a = await cohort(termId, "gamer-fuera-a", 1, joinedAt);
    const b = await cohort(termId, "gamer-fuera-b", 1, joinedAt);
    expect((await getTerm(termId))?.gamePointsSeparated).toBe(false);
    await adjust(a.member, termId, 10);
    await adjust(b.member, termId, 20);
    const actor = { personId: a.member, ip: null };
    const wordleId = await seedWordleGame(a.member, termId, "2025-10-16", { status: "WON" });
    const game2048 = await startGame2048As(actor, { requestId: randomUUID() });
    const sudoku = await startSudokuAs(actor, {
      requestId: randomUUID(),
      difficulty: "HARD",
      assisted: false,
    });
    const color = await startColorAs(actor, { requestId: randomUUID() });
    if (!game2048.ok || !sudoku.ok || !color.ok) {
      throw new Error("No se pudo iniciar un juego sintético");
    }
    const panalId = await seedPanalGame({
      personId: a.member,
      termId,
      day: "2025-10-16",
      puzzleId: "test",
      dictionaryVersion: "test",
      rulesVersion: "test",
    });
    const credits: Array<Parameters<typeof creditGame>[1]> = [
      { game: "WORDLE", runId: wordleId, personId: a.member, termId, points: 6, reason: "Wordle" },
      {
        game: "GAME2048",
        runId: game2048.run.id,
        personId: a.member,
        termId,
        points: 6,
        reason: "2048",
      },
      {
        game: "SUDOKU",
        runId: sudoku.run.id,
        personId: a.member,
        termId,
        points: 6,
        reason: "Sudoku",
      },
      {
        game: "PANAL",
        runId: panalId,
        checkpoint: 1,
        personId: a.member,
        termId,
        points: 1,
        reason: "Panal",
      },
      {
        game: "COLOR",
        runId: color.run.id,
        personId: a.member,
        termId,
        points: 6,
        reason: "Color",
      },
    ];
    expect(committee(await rankCommittees(termId), a.committeeId).row.ghAverage).toBe(10);
    for (const input of credits) {
      await gameCredit(input);
      const ranking = await rankCommittees(termId);
      expect(committee(ranking, a.committeeId)).toMatchObject({
        rank: 2,
        row: { ghTotal: 10, ghAverage: 10, ghNormalized: 0.5, score: 0.25 },
      });
      expect(committee(ranking, b.committeeId)).toMatchObject({
        rank: 1,
        row: { ghTotal: 20, ghAverage: 20, score: 0.5 },
      });
    }
  });
});
