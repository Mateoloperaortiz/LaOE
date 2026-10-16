import { z } from "zod";
import type { CommitteeStanding } from "../committee-ranking-types";

const base = z.object({
  rank: z.number().int(),
  committeeId: z.string(),
  name: z.string(),
  score: z.number(),
  rawScore: z.number(),
  occasions: z.number().int(),
});

const legacy = base.extend({ rankingMetric: z.literal("ATTENDANCE").optional() }).transform(
  (row): CommitteeStanding => ({
    ...row,
    rankingMetric: "ATTENDANCE",
    attendanceScore: row.score,
    ghTotal: null,
    activeMembers: null,
    ghAverage: null,
    ghNormalized: null,
    attendanceNormalized: null,
    policy: null,
  }),
);

const combined = base.extend({
  rankingMetric: z.literal("COMBINED"),
  attendanceScore: z.number(),
  ghTotal: z.number(),
  activeMembers: z.number().int().positive(),
  ghAverage: z.number(),
  ghNormalized: z.number(),
  attendanceNormalized: z.number(),
  policy: z.object({
    version: z.literal("GH_ATTENDANCE_50_50_V1"),
    effectiveAt: z.iso.datetime(),
    ghWeight: z.literal(0.5),
    attendanceWeight: z.literal(0.5),
    ghAverageMax: z.number(),
    attendanceMax: z.number(),
  }),
});

/** Una foto vieja conserva su asistencia; nunca se completa con GH del roster actual. */
export function storedCommitteeRanking(value: unknown): CommitteeStanding[] {
  return z
    .array(z.union([combined, legacy]))
    .catch([])
    .parse(value);
}
