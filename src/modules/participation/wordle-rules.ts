/** Reglas públicas compartidas por la validación del servidor y la explicación del premio. */
export const WORDLE_MAX_ATTEMPTS = 6;

export function wordleReward(attempt: number): number {
  return Number.isInteger(attempt) && attempt >= 1 && attempt <= WORDLE_MAX_ATTEMPTS
    ? 7 - attempt
    : 0;
}
