import "server-only";
import allowedV1 from "../data/wordle/versions/rla-es-2.9-oe-v1/allowed.json" with { type: "json" };
import answersV1 from "../data/wordle/versions/rla-es-2.9-oe-v1/answers.json" with { type: "json" };
import { normalizeWordleGuess } from "./wordle-pure";

export const WORDLE_DICTIONARY_VERSION = "rla-es-2.9-oe-v1";

// Agregar versiones, nunca sustituir las que puedan tener partidas guardadas.
const dictionaries: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["rla-es-2.9-oe-v1", new Set(allowedV1)],
]);

export const WORDLE_ANSWERS: readonly string[] = Object.freeze([...answersV1]);

export function hasWordleDictionary(version: string): boolean {
  return dictionaries.has(version);
}

export function isWordleGuess(word: string, version = WORDLE_DICTIONARY_VERSION): boolean {
  return dictionaries.get(version)?.has(normalizeWordleGuess(word)) ?? false;
}
