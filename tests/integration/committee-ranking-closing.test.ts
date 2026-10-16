import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  adjustPointsAs,
  closeTermPointsAs,
  getTermStanding,
  rankCommittees,
} from "@/modules/participation";
import { setCommitteeMembershipsAs } from "@/modules/people";
import { term } from "@/modules/terms/schema";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
  seedTermStanding,
} from "../factories";
import { truncateAll } from "./db";

describe("fotos del ranking de comités", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("congela todos los componentes y la población, aunque luego la persona cambie de comité", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cierre-comite@example.test");
    const first = await seedCommittee("foto-uno");
    const second = await seedCommittee("foto-dos");
    await seedCommitteeMembership(personId, first, termId);
    await adjustPointsAs(
      { personId, ip: null },
      { personId, termId, points: 12, reason: "GH sintético" },
    );
    await closeTermPointsAs({ personId, ip: null }, termId);
    const snapshot = await getTermStanding(termId);
    const frozen = await rankCommittees(termId);
    expect(snapshot?.stats.committeeRankingMetric).toBe("COMBINED");
    expect(snapshot?.topCommittees).toEqual([
      expect.objectContaining({
        committeeId: first,
        rank: 1,
        rankingMetric: "COMBINED",
        score: 0.5,
        ghTotal: 12,
        activeMembers: 1,
        ghAverage: 12,
        ghNormalized: 1,
        attendanceScore: 0,
        attendanceNormalized: 0,
        occasions: 0,
        policy: expect.objectContaining({
          version: "GH_ATTENDANCE_50_50_V1",
          ghAverageMax: 12,
          attendanceMax: 0,
          ghWeight: 0.5,
          attendanceWeight: 0.5,
        }),
      }),
    ]);
    await setCommitteeMembershipsAs({ personId, ip: null }, personId, termId, [
      { committeeId: second },
    ]);
    expect(await rankCommittees(termId)).toEqual(frozen);
    expect(await getTermStanding(termId)).toEqual(snapshot);
  });

  it("conserva el puesto de la foto histórica con GH desconocido, aunque exista saldo actual", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("historia-comite@example.test");
    const committeeId = await seedCommittee("historico");
    await seedCommitteeMembership(personId, committeeId, termId);
    await adjustPointsAs(
      { personId, ip: null },
      { personId, termId, points: 90, reason: "Saldo posterior sintético" },
    );
    await getDb().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, termId));
    await seedTermStanding({
      termId,
      topNew: [],
      topVeteran: [],
      topCommittees: [
        {
          committeeId,
          name: "Comité histórico",
          rank: 3,
          score: 0.0903,
          rawScore: 0.1,
          occasions: 2,
        },
      ],
      stats: { activeMembers: 1, newMembers: 1, occasions: 2, checkIns: 0, pointsAwarded: 90 },
    });
    expect(await rankCommittees(termId)).toEqual([
      {
        rank: 3,
        total: 903,
        row: {
          committeeId,
          name: "Comité histórico",
          rankingMetric: "ATTENDANCE",
          score: 0.0903,
          attendanceScore: 0.0903,
          rawScore: 0.1,
          occasions: 2,
          ghTotal: null,
          activeMembers: null,
          ghAverage: null,
          ghNormalized: null,
          attendanceNormalized: null,
          policy: null,
        },
      },
    ]);
    expect((await getTermStanding(termId))?.topCommittees[0]).toMatchObject({
      rank: 3,
      rankingMetric: "ATTENDANCE",
      ghAverage: null,
      score: 0.0903,
    });
  });

  it("no reconstruye un término cerrado sin foto desde el roster y saldo vivos", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("sin-foto@example.test");
    const committeeId = await seedCommittee("sin-foto");
    await seedCommitteeMembership(personId, committeeId, termId);
    await adjustPointsAs(
      { personId, ip: null },
      { personId, termId, points: 5, reason: "GH sintético" },
    );
    await getDb().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, termId));
    expect(await rankCommittees(termId)).toEqual([]);
    expect(await getTermStanding(termId)).toBeNull();
  });
});
