import { z } from "zod";
import type { GamerRankingMetric } from "../gamer-types";

export const standingGamer = z.object({
  rank: z.number().int(),
  personId: z.string(),
  name: z.string(),
  points: z.number().int().nonnegative().nullable().default(null),
  participations: z.number().int(),
  activeDays: z.number().int(),
});

export const gamerSnapshotStats = z.object({
  gamerRankingMetric: z.enum(["POINTS", "PARTICIPATIONS"]).nullable().optional(),
  gamerPositions: z
    .array(
      z.object({
        personId: z.string(),
        rank: z.number().int(),
        points: z.number().int().nonnegative().nullable().default(null),
        participations: z.number().int().optional(),
        activeDays: z.number().int().optional(),
      }),
    )
    .optional(),
  gamerPlayers: z.number().int().optional(),
});

/** Una columna topGamer vacía por migración no demuestra que el cierre guardara esa competencia. */
export function storedGamerMetric(
  stats: z.infer<typeof gamerSnapshotStats>,
): GamerRankingMetric | null {
  return stats.gamerRankingMetric !== undefined
    ? stats.gamerRankingMetric
    : stats.gamerPositions !== undefined
      ? "PARTICIPATIONS"
      : null;
}
