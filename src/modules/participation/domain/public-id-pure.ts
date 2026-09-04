import { randomInt } from "node:crypto";

// Identificador público de una ocasión (ADR-035 regla 3): diez caracteres sin ambiguos para dictarlo
// o imprimirlo; la validación acepta cualquier [0-9a-z] para que los publicId heredados de GHPOINTS
// sigan resolviendo tal cual.

export const PUBLIC_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const PUBLIC_ID_LENGTH = 10;
export const PUBLIC_ID = /^[0-9a-z]{10}$/;

export function newPublicId(random: (max: number) => number = randomInt): string {
  let value = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i += 1) {
    value += PUBLIC_ID_ALPHABET[random(PUBLIC_ID_ALPHABET.length)] ?? "";
  }
  return value;
}

export function isPublicId(value: string): boolean {
  return PUBLIC_ID.test(value);
}
