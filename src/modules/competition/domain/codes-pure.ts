import { createHash, randomInt, timingSafeEqual } from "node:crypto";

// Código de equipo sin I/O (ADR-089 regla 3, ADR-091 regla 3): ocho caracteres Crockford base32,
// que se muestran en claro una sola vez para la tarjeta del capitán. La casa guarda solo el hash con
// secreto, y un operador lo pide para actuar en nombre del equipo.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TEAM_CODE_LENGTH = 8;
export const TEAM_CODE_MAX_FAILURES = 5;
export const TEAM_CODE_LOCK_MS = 15 * 60_000;

export function generateTeamCode(): string {
  let code = "";
  for (let i = 0; i < TEAM_CODE_LENGTH; i++) code += ALPHABET[randomInt(0, ALPHABET.length)];
  return code;
}

/** Acepta minúsculas, espacios y guiones, y lee O como 0 e I o L como 1 (Crockford). */
export function normalizeTeamCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (code.length !== TEAM_CODE_LENGTH) return null;
  for (const char of code) if (!ALPHABET.includes(char)) return null;
  return code;
}

/** Para imprimir: ABCD-EFGH. */
export function formatTeamCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function hashTeamCode(secret: string, teamId: string, code: string): string {
  return createHash("sha256").update(`competition-team:${secret}:${teamId}:${code}`).digest("hex");
}

export function teamCodeMatches(
  expectedHash: string,
  secret: string,
  teamId: string,
  raw: string,
): boolean {
  const code = normalizeTeamCode(raw);
  if (!code) return false;
  const actual = Buffer.from(hashTeamCode(secret, teamId, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Tras cinco fallos seguidos, el código queda bloqueado 15 minutos. */
export function lockAfterFailure(failures: number, now: Date): Date | null {
  return failures >= TEAM_CODE_MAX_FAILURES ? new Date(now.getTime() + TEAM_CODE_LOCK_MS) : null;
}
