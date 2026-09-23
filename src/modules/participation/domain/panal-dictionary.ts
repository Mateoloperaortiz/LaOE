import "server-only";
import puzzlesV1 from "../data/panal/versions/rla-es-2.9-panal-v1/puzzles.json" with {
  type: "json",
};
import puzzlesV2 from "../data/panal/versions/rla-es-2.9-panal-v2/puzzles.json" with {
  type: "json",
};
import { hasPanalCheckpoints, panalGeniusScore, panalWordScore } from "../panal-engine";
import type { PanalPuzzleView } from "../panal-types";

export function panalDictionaryVersion(day: string): string {
  return hasPanalCheckpoints(day) ? "rla-es-2.9-panal-v2" : "rla-es-2.9-panal-v1";
}
type Puzzle = (typeof puzzlesV1)[number];
const versions = new Map<string, readonly Puzzle[]>([
  ["rla-es-2.9-panal-v1", puzzlesV1],
  ["rla-es-2.9-panal-v2", puzzlesV2],
]);

export function panalPuzzleForDay(day: string): Puzzle {
  const index = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const puzzles = versions.get(panalDictionaryVersion(day)) ?? [];
  const puzzle = puzzles[((index % puzzles.length) + puzzles.length) % puzzles.length];
  if (!puzzle) throw new Error("No hay un panal para esta fecha");
  return puzzle;
}

export function getPanalPuzzle(version: string, id: string): Puzzle | undefined {
  return versions.get(version)?.find((puzzle) => puzzle.id === id);
}

/** Solo esta proyección cruza al navegador. */
export function panalPuzzleView(puzzle: Puzzle): PanalPuzzleView {
  const maxScore = puzzle.words.reduce((sum, word) => sum + panalWordScore(word), 0);
  return {
    letters: puzzle.letters,
    center: puzzle.center,
    totalWords: puzzle.words.length,
    maxScore,
    geniusScore: panalGeniusScore(maxScore),
  };
}
