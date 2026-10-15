import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  activatePresenceNotice24hAs,
  balanceFor,
  closeOccasionAs,
  closeTermPointsAs,
  getPresenceStreak,
  getTermStanding,
} from "@/modules/participation";
import { closeTermPoints } from "@/modules/terms";
import {
  seedCheckIn,
  seedConfig,
  seedMembershipEvent,
  seedOccasion,
  seedTerm,
  seedTermStanding,
  seedVeteran,
} from "../factories";
import { truncateAll } from "./db";

const NOW = new Date("2026-10-15T12:19:12Z");

async function setup() {
  const termId = await seedTerm();
  const personId = await seedVeteran("pausa-sintetica@example.test");
  await seedMembershipEvent(personId, {
    from: null,
    to: "ACTIVE",
    at: new Date("2026-10-01T05:00:00Z"),
  });
  await seedConfig("gamification.launch", { at: "2026-10-15T10:20:10Z" });
  const late = await seedOccasion(termId, {
    startsAt: new Date("2026-10-15T15:00:00Z"),
    openedAt: new Date("2026-10-13T16:45:00Z"),
    status: "OPEN",
    newMembersOnly: false,
    committeeId: null,
  });
  const attended = await seedOccasion(termId, {
    startsAt: new Date("2026-10-08T15:00:00Z"),
    openedAt: new Date("2026-10-04T15:00:00Z"),
    status: "CLOSED",
  });
  await seedCheckIn(attended.id, personId);
  return { termId, personId, lateId: late.id };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe("lectura y foto de los motivos de pausa presencial", () => {
  it("la API pública explica la oferta tardía sin modificar la racha ni acreditar bonos", async () => {
    const { termId, personId } = await setup();
    const before = await balanceFor(personId, termId);
    expect(await getPresenceStreak(personId, termId)).toMatchObject({
      currentStreak: 1,
      longestStreak: 1,
      weekStatus: "PAUSED",
      weekPauseReasons: ["LATE_PUBLICATION"],
      bonus: 0,
    });
    expect(await balanceFor(personId, termId)).toBe(before);
  });

  it("el cierre conserva el motivo junto al reconocimiento sin volver a consultar el calendario", async () => {
    const { termId, personId, lateId } = await setup();
    await closeOccasionAs({ personId, ip: null }, lateId);
    const before = await getPresenceStreak(personId, termId);
    await closeTermPointsAs({ personId, ip: null }, termId);
    expect(await getPresenceStreak(personId, termId)).toEqual(before);
    expect((await getTermStanding(termId))?.stats.presenceRecognitions).toContainEqual({
      personId,
      recognition: before,
    });
  });

  it("una foto anterior sin motivos conserva sus cifras y no inventa publicación tardía desde hechos actuales", async () => {
    const { termId, personId } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await seedTermStanding({
      termId,
      topNew: [],
      topVeteran: [],
      topCommittees: [],
      stats: {
        activeMembers: 1,
        newMembers: 0,
        occasions: 2,
        checkIns: 1,
        pointsAwarded: 0,
        presenceRecognitions: [
          {
            personId,
            recognition: {
              recognitionAvailable: true,
              launched: true,
              currentStreak: 4,
              longestStreak: 4,
              weekStatus: "PAUSED",
              weekKey: "2026-10-12",
              bonus: 0,
              nextBonus: 5,
              weeks: [{ weekKey: "2026-10-12", status: "PAUSED", streak: 4, bonus: 0 }],
            },
          },
        ],
      },
    });
    await activatePresenceNotice24hAs(SYSTEM_ACTOR);
    expect(await getPresenceStreak(personId, termId)).toMatchObject({
      currentStreak: 4,
      longestStreak: 4,
      weekStatus: "PAUSED",
      weekPauseReasons: [],
      weeks: [{ weekKey: "2026-10-12", status: "PAUSED", streak: 4, pauseReasons: [] }],
    });
  });
});
