import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  advanceRotationAs,
  assignStaffAs,
  type CompetitionActor,
  createCompetitionAs,
  createTeamAs,
  generateDayScheduleAs,
  getLiveRotations,
  getRecordingTracker,
  judgeView,
  recordResultAs,
  saveBaseAs,
  startMatchupAs,
} from "@/modules/competition";
import { competitionSupport } from "@/modules/competition/schema";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// El seguimiento del registro (ADR-105): la lista de la rotación en curso con el líder y el
// calificador, las deudas de las rotaciones cerradas, quién se demora más y el aviso al líder.

const admin = (personId: string): CompetitionActor => ({ personId, isAdmin: true, ip: null });
const member = (personId: string): CompetitionActor => ({ personId, isAdmin: false, ip: null });

/** Seis equipos y tres bases el jueves: la base A con líder y calificador, la B con líder y la C sin
 *  nadie. */
async function seedField() {
  await seedTerm();
  const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug: "dias-seguimiento",
      name: "Días EAFIT",
      summary: "",
      description: "",
      audience: "PUBLIC",
      publicationStatus: "PUBLISHED",
      sortOrder: 1,
    }),
  );
  const edition = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: evento.id,
      slug: "2026",
      name: "2026",
      description: "",
      startsAt: new Date("2026-09-28T13:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  const adminId = await seedMember("admin-seguimiento@example.com");
  const { id } = await createCompetitionAs(admin(adminId), {
    editionId: edition.id,
    slug: "the-games-2026",
    name: "The Games 2026",
  });
  for (let n = 1; n <= 6; n++) {
    await createTeamAs(admin(adminId), id, { number: n, name: `Equipo ${n}` });
  }
  const bases: string[] = [];
  for (const [index, name] of ["A", "B", "C"].entries()) {
    const base = await saveBaseAs(admin(adminId), id, null, { day: 1, orderIndex: index, name });
    bases.push(base.id);
  }
  const [baseA = "", baseB = "", baseC = ""] = bases;
  const judgeA = await seedMember("lider-a@example.com", { firstName: "Líder", lastName: "Uno" });
  const judgeB = await seedMember("lider-b@example.com", { firstName: "Líder", lastName: "Dos" });
  const grader = await seedMember("calificador@example.com", {
    firstName: "Calificador",
    lastName: "Uno",
  });
  await assignStaffAs(admin(adminId), id, { personId: judgeA, role: "JUDGE", baseId: baseA });
  await assignStaffAs(admin(adminId), id, { personId: judgeB, role: "JUDGE", baseId: baseB });
  await getDb()
    .insert(competitionSupport)
    .values({ competitionId: id, baseId: baseA, personId: grader, role: "GRADER" });
  await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 3, plannedMinutes: 20 });
  return { id, adminId, judgeA, judgeB, baseA, baseB, baseC };
}

async function currentMatchup(id: string, baseId: string) {
  const { current } = await getLiveRotations(id);
  const found = current?.matchups.find((matchup) => matchup.base.id === baseId);
  if (!found) throw new Error("sin enfrentamiento");
  return found;
}

describe("seguimiento del registro", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("la lista, el aviso, las deudas y quién se demora más", async () => {
    const { id, adminId, judgeA, judgeB, baseA, baseB, baseC } = await seedField();
    expect((await getRecordingTracker(id)).current).toBeNull();

    await advanceRotationAs(admin(adminId), id);
    const a1 = await currentMatchup(id, baseA);
    const b1 = await currentMatchup(id, baseB);
    await recordResultAs(member(judgeA), id, { matchupId: a1.id, outcome: "A_WIN" });
    await startMatchupAs(member(judgeB), id, b1.id);
    // Corregir después no cambia el primer registro ni quién lo hizo.
    await recordResultAs(admin(adminId), id, { matchupId: a1.id, outcome: "B_WIN" });

    const live = await getRecordingTracker(id);
    expect(live.day).toBe(1);
    expect(live.current).toMatchObject({ rotation: { number: 1, day: 1 }, recorded: 1, total: 3 });
    const rows = live.current?.rows ?? [];
    expect(rows.map((row) => [row.base.name, row.state.kind])).toEqual([
      ["B", "PLAYING"],
      ["C", "NOT_STARTED"],
      ["A", "RECORDED"],
    ]);
    expect(rows[2]?.state).toMatchObject({ by: "JUDGE" });
    expect(rows[2]?.base).toMatchObject({ judges: ["Líder Uno"], graders: ["Calificador Uno"] });
    expect(rows[1]?.base).toMatchObject({ judges: [], graders: [] });

    const leaderB = await judgeView(id, judgeB);
    expect(leaderB.nudges).toEqual([{ matchupId: b1.id, recorded: 1, total: 3 }]);
    expect((await judgeView(id, judgeA)).nudges).toEqual([]);

    // Cerrar la rotación 1 deja debiendo a B y a C; B se lo pasa a la operación.
    await advanceRotationAs(admin(adminId), id);
    const owed = await getRecordingTracker(id);
    expect(owed.debts.map((debt) => [debt.rotation.number, debt.base.name])).toEqual([
      [1, "B"],
      [1, "C"],
    ]);
    expect(owed.current?.rotation.number).toBe(2);
    expect((await judgeView(id, judgeB)).debts).toMatchObject([{ number: 1, baseName: "B" }]);
    await recordResultAs(admin(adminId), id, { matchupId: b1.id, outcome: "DRAW" });

    const after = await getRecordingTracker(id);
    expect(after.debts.map((debt) => debt.base.id)).toEqual([baseC]);
    expect((await judgeView(id, judgeB)).debts).toEqual([]);
    expect(after.playedRotations).toBe(2);
    expect(
      after.ranking.map((row) => [row.base.name, row.owed, row.byJudge, row.byOperation]),
    ).toEqual([
      ["C", 1, 0, 0],
      ["B", 0, 0, 1],
      ["A", 0, 1, 0],
    ]);
    expect(after.ranking[0]?.lastCount).toBe(1);

    const friday = await getRecordingTracker(id, 2);
    expect(friday).toMatchObject({ day: 2, playedRotations: 0, ranking: [] });
  });
});
