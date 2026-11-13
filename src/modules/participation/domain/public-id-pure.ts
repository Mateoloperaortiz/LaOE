import { randomInt } from "node:crypto";
import { isPublicId } from "@/shared/lib/occasion-public-id";

export { isPublicId };

// Identificador público de una ocasión (ADR-035 regla 3): diez caracteres sin ambiguos para dictarlo
// o imprimirlo. Su forma, sin nada de servidor, vive en `src/shared/lib/occasion-public-id.ts`.

export const PUBLIC_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const PUBLIC_ID_LENGTH = 10;

export function newPublicId(random: (max: number) => number = randomInt): string {
  let value = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i += 1) {
    value += PUBLIC_ID_ALPHABET[random(PUBLIC_ID_ALPHABET.length)] ?? "";
  }
  return value;
}
