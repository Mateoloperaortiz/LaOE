import type { WordleLetterState } from "../wordle-types";

export const WORDLE_RULES_VERSION = "es-5x6-v1";
export const WORDLE_MAX_ATTEMPTS = 6;

/** NFC conserva Ñ incluso si llega descompuesta; solo se omiten acentos de vocales. */
export function normalizeWordleGuess(value: string): string {
  return value
    .trim()
    .normalize("NFC")
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÜ]/g, (letter) => {
      return (
        ({ Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U" } as Record<string, string>)[letter] ??
        letter
      );
    });
}

export function isWordleWord(value: string): boolean {
  return /^[A-ZÑ]{5}$/.test(value);
}

/** Primero consume coincidencias exactas; después reparte las letras que quedan. */
export function scoreWordleGuess(guess: string, answer: string): WordleLetterState[] {
  if (!isWordleWord(guess) || !isWordleWord(answer)) {
    throw new Error("Wordle requiere cinco letras normalizadas");
  }
  const result: WordleLetterState[] = Array.from({ length: 5 }, () => "absent");
  const remaining = new Map<string, number>();
  for (let i = 0; i < 5; i += 1) {
    const letter = answer.charAt(i);
    if (guess.charAt(i) === letter) result[i] = "correct";
    else remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
  }
  for (let i = 0; i < 5; i += 1) {
    const letter = guess.charAt(i);
    const count = remaining.get(letter) ?? 0;
    if (result[i] !== "correct" && count > 0) {
      result[i] = "present";
      remaining.set(letter, count - 1);
    }
  }
  return result;
}

export function wordleReward(attempt: number): number {
  return Number.isInteger(attempt) && attempt >= 1 && attempt <= WORDLE_MAX_ATTEMPTS
    ? 7 - attempt
    : 0;
}

/** Colombia no cambia de huso en verano: su día empieza a las 05:00 UTC. */
export function wordleDay(now = new Date()): string {
  return new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function nextWordleAt(day: string): string {
  return new Date(new Date(`${day}T05:00:00.000Z`).getTime() + 86_400_000).toISOString();
}
