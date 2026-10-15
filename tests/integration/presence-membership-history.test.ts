import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { presenceStreakFromFacts } from "@/modules/participation/domain/presence-streak-pure";
import { getPresenceMembershipHistory, setCommitteeMembershipsAs } from "@/modules/people";
import { seedCommittee, seedMembershipEvent, seedTerm, seedVeteran } from "../factories";
import { truncateAll } from "./db";

const at = (day: string) => new Date(`${day}T17:00:00Z`);

describe("oportunidades con historia de comités", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("2026-09-01"));
    await truncateAll();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(closeDb);

  it("reconstruye A→B→A por comandos públicos y no transforma en falta una semana fuera de A", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await seedVeteran("historia-comite@example.test");
    await seedMembershipEvent(personId, { from: null, to: "ACTIVE", at: at("2026-07-01") });
    const a = await seedCommittee("historia-a");
    const b = await seedCommittee("historia-b");
    const set = async (day: string, committeeId: string) => {
      vi.setSystemTime(at(day));
      await setCommitteeMembershipsAs(SYSTEM_ACTOR, personId, termId, [{ committeeId }]);
    };
    await set("2026-09-01", a);
    await set("2026-09-14", b);
    await set("2026-09-21", a);
    const history = await getPresenceMembershipHistory(personId, termId);
    expect(history?.committees).toEqual([
      { committeeId: a, joinedAt: at("2026-09-01"), leftAt: at("2026-09-14") },
      { committeeId: b, joinedAt: at("2026-09-14"), leftAt: at("2026-09-21") },
      { committeeId: a, joinedAt: at("2026-09-21"), leftAt: null },
    ]);
    const result = presenceStreakFromFacts({
      term: { id: termId, startsOn: "2026-09-07", endsOn: "2026-12-31" },
      member: history,
      launchedAt: at("2026-09-01"),
      now: at("2026-09-28"),
      occasions: [
        {
          startsAt: at("2026-09-08"),
          openedAt: at("2026-09-01"),
          status: "CLOSED",
          committeeId: a,
          newMembersOnly: false,
          checkInStatus: "APPROVED",
        },
        {
          startsAt: at("2026-09-15"),
          openedAt: at("2026-09-01"),
          status: "CLOSED",
          committeeId: a,
          newMembersOnly: false,
          checkInStatus: null,
        },
        {
          startsAt: at("2026-09-22"),
          openedAt: at("2026-09-01"),
          status: "CLOSED",
          committeeId: a,
          newMembersOnly: false,
          checkInStatus: "APPROVED",
        },
      ],
    });
    expect(result.weeks[1]).toMatchObject({ status: "PAUSED", streak: 1 });
    expect(result.currentStreak).toBe(2);
  });

  it("una membresía importada sin eventos no crea oportunidades antes de su primera evidencia", async () => {
    const personId = await seedVeteran("sin-historia-miembro@example.test");
    const termId = await seedTerm("2026-2");
    const history = await getPresenceMembershipHistory(personId, termId);
    expect(history?.changes[0]).toMatchObject({ from: "INACTIVE", to: "ACTIVE" });
    const result = presenceStreakFromFacts({
      term: { id: termId, startsOn: "2026-09-07", endsOn: "2026-12-31" },
      member: history,
      launchedAt: at("2026-09-01"),
      now: at("2026-09-28"),
      occasions: [
        {
          startsAt: at("2026-09-15"),
          openedAt: at("2026-09-01"),
          status: "CLOSED",
          committeeId: null,
          newMembersOnly: false,
          checkInStatus: null,
        },
      ],
    });
    expect(result.weeks[1]?.status).toBe("PAUSED");
  });
});
