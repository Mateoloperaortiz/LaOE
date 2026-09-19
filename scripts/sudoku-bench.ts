import { createHash } from "node:crypto";
import {
  countSolutions,
  generateSudoku,
  SUDOKU_MAX_ATTEMPTS,
} from "../src/modules/participation/domain/sudoku-generator";
import { SUDOKU_DIFFICULTIES } from "../src/modules/participation/sudoku-engine";

// Medición del generador del Sudoku (ADR-078 regla 6): las constantes salen de medir, no de estimar.
// Uso: node --import tsx scripts/sudoku-bench.ts [semillas por dificultad] [muestras de unicidad]
// Las semillas salen de un contador, así dos corridas miden lo mismo.

const seeds = Number(process.argv[2] ?? 2000);
const uniquenessSamples = Number(process.argv[3] ?? 300);

function seedFor(difficulty: string, index: number): string {
  return createHash("sha256").update(`${difficulty}:${index}`).digest("hex").slice(0, 16);
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function summary(values: number[], digits: number): string {
  const sorted = [...values].sort((a, b) => a - b);
  return [0.5, 0.99, 1].map((fraction) => percentile(sorted, fraction).toFixed(digits)).join(" / ");
}

process.stdout.write(
  `Semillas por dificultad: ${seeds}; tope de intentos: ${SUDOKU_MAX_ATTEMPTS}\n`,
);
for (const difficulty of SUDOKU_DIFFICULTIES) {
  const elapsed: number[] = [];
  const attempts: number[] = [];
  const givens: number[] = [];
  let exhausted = 0;
  let ambiguous = 0;
  for (let index = 0; index < seeds; index += 1) {
    const before = performance.now();
    const board = generateSudoku(seedFor(difficulty, index), difficulty);
    elapsed.push(performance.now() - before);
    if (!board) {
      exhausted += 1;
      continue;
    }
    attempts.push(board.attempts);
    givens.push(81 - (board.givens.match(/0/g)?.length ?? 0));
    if (index < uniquenessSamples && countSolutions(board.givens, 2) !== 1) {
      ambiguous += 1;
    }
  }
  process.stdout.write(
    `${[
      difficulty.padEnd(6),
      `ms p50/p99/máx ${summary(elapsed, 1)}`,
      `intentos ${summary(attempts, 0)}`,
      `dadas ${summary(givens, 0)} (mín ${Math.min(...givens)})`,
      `agotadas ${exhausted}`,
      `ambiguos ${ambiguous}/${Math.min(seeds, uniquenessSamples)}`,
    ].join(" · ")}\n`,
  );
}
