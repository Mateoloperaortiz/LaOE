import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  achievement,
  challenge,
  challengeParticipation,
  checkIn,
  colorRun,
  occasion,
  panalGame,
  pointEntry,
  sudokuRun,
  wordleGame,
} from "../schema";
import { ghPointCondition } from "./ledger-classification";

// «Tu semestre en la OE» (ADR-173): lo que una persona hizo en un semestre, contado desde lo que ya
// guarda la casa. Solo números de ella: nada se compara con nadie.

export interface SemesterSummary {
  attended: number;
  points: number;
  challenges: number;
  badges: number;
  games: number;
}

export async function semesterSummaryFor(
  personId: string,
  termId: string,
): Promise<SemesterSummary> {
  const db = getDb();
  const one = async (query: Promise<Array<{ n: number }>>) => (await query)[0]?.n ?? 0;
  const [attended, points, challenges, badges, wordle, sudoku, color, panal] = await Promise.all([
    one(
      db
        .select({ n: count() })
        .from(checkIn)
        .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
        .where(
          and(
            eq(checkIn.personId, personId),
            eq(occasion.termId, termId),
            eq(checkIn.status, "APPROVED"),
          ),
        ),
    ),
    one(
      db
        .select({ n: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
        .from(pointEntry)
        .where(
          and(
            eq(pointEntry.personId, personId),
            eq(pointEntry.termId, termId),
            ghPointCondition,
            sql`${pointEntry.points} > 0`,
          ),
        ),
    ),
    one(
      db
        .select({ n: count() })
        .from(challengeParticipation)
        .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
        .where(
          and(
            eq(challengeParticipation.personId, personId),
            eq(challenge.termId, termId),
            eq(challengeParticipation.status, "COMPLETED"),
          ),
        ),
    ),
    one(
      db
        .select({ n: count() })
        .from(achievement)
        .where(and(eq(achievement.personId, personId), eq(achievement.termId, termId))),
    ),
    one(
      db
        .select({ n: count() })
        .from(wordleGame)
        .where(
          and(
            eq(wordleGame.personId, personId),
            eq(wordleGame.termId, termId),
            isNotNull(wordleGame.completedAt),
          ),
        ),
    ),
    one(
      db
        .select({ n: count() })
        .from(sudokuRun)
        .where(
          and(
            eq(sudokuRun.personId, personId),
            eq(sudokuRun.termId, termId),
            isNotNull(sudokuRun.finishedAt),
          ),
        ),
    ),
    one(
      db
        .select({ n: count() })
        .from(colorRun)
        .where(
          and(
            eq(colorRun.personId, personId),
            eq(colorRun.termId, termId),
            isNotNull(colorRun.finishedAt),
          ),
        ),
    ),
    one(
      db
        .select({ n: count() })
        .from(panalGame)
        .where(and(eq(panalGame.personId, personId), eq(panalGame.termId, termId))),
    ),
  ]);
  return { attended, points, challenges, badges, games: wordle + sudoku + color + panal };
}
