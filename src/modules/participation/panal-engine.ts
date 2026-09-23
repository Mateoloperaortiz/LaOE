// Reglas compartidas sin diccionario ni I/O. Las palabras válidas viven solo en el servidor.
import type { PanalCheckpointId } from "./panal-types";

export const PANAL_RULES_VERSION = "es-7-v2";
export const PANAL_REWARD = 6;
// Día civil de Colombia; antes del corte se conservan catálogo, reglas y premio originales.
export const PANAL_CHECKPOINTS_START_DAY = "2026-09-24";
export function hasPanalCheckpoints(day: string): boolean {
  return day >= PANAL_CHECKPOINTS_START_DAY;
}
export const PANAL_RANK_PERCENTAGES = [0, 2, 5, 8, 15, 25, 40, 50, 70] as const;

export function isSupportedPanalRules(version: string): boolean {
  return version === "es-7-v1" || version === PANAL_RULES_VERSION;
}

export function panalCheckpoints(geniusScore: number) {
  return [
    { id: 1 as PanalCheckpointId, points: 1, words: 5, score: 0 },
    { id: 2 as PanalCheckpointId, points: 2, words: 10, score: 0 },
    { id: 3 as PanalCheckpointId, points: 3, words: 0, score: geniusScore },
  ];
}

export function reachedPanalCheckpoints(words: number, score: number, geniusScore: number) {
  return panalCheckpoints(geniusScore).filter(
    (checkpoint) => words >= checkpoint.words && score >= checkpoint.score,
  );
}

export function normalizePanalWord(value: string): string {
  return value
    .trim()
    .normalize("NFC")
    .toUpperCase()
    .replace(
      /[ÁÉÍÓÚÜ]/g,
      (letter) => ({ Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U" })[letter] ?? letter,
    );
}

export function panalWordError(word: string, letters: string, center: string) {
  if (word.length < 4) return "TOO_SHORT";
  if (!/^[A-ZÑ]{4,32}$/.test(word)) return "INVALID_INPUT";
  if (!word.includes(center)) return "MISSING_CENTER";
  if ([...word].some((letter) => !letters.includes(letter))) return "OUTSIDE_LETTERS";
  return null;
}

export function isPanalPangram(word: string): boolean {
  return new Set(word).size === 7;
}

/** Recibe una palabra ya validada. */
export function panalWordScore(word: string): number {
  return (word.length === 4 ? 1 : word.length) + (isPanalPangram(word) ? 7 : 0);
}

export function panalGeniusScore(maxScore: number): number {
  return Math.ceil((maxScore * 70) / 100);
}

export function panalRank(score: number, maxScore: number): number {
  if (score >= maxScore) return PANAL_RANK_PERCENTAGES.length;
  return PANAL_RANK_PERCENTAGES.findLastIndex(
    (percent) => score >= Math.ceil((maxScore * percent) / 100),
  );
}
