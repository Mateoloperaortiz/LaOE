import { createHmac, timingSafeEqual } from "node:crypto";

// La sesión del hub de capitanes (ADR-096), sin I/O: una cookie firmada del equipo, no de una persona.
// Lleva la competencia, el equipo, cuándo se emitió su código y cuándo vence. Volver a emitir el código
// la invalida, porque cambia `codeIssuedAt`.

export const HUB_COOKIE = "oe_capitanes";
export const HUB_PATH = "/capitanes";
export const HUB_SESSION_MS = 12 * 60 * 60_000;
export const HUB_MAX_FAILURES_PER_IP = 30;
export const HUB_FAILURE_WINDOW_MS = 15 * 60_000;

export interface HubSession {
  competitionId: string;
  teamId: string;
  /** `codeIssuedAt` del equipo, en milisegundos. */
  codeIssuedAt: number;
  expiresAt: number;
}

const VERSION = "v1";

function signature(secret: string, payload: string): string {
  return createHmac("sha256", `competition-hub:${secret}`).update(payload).digest("base64url");
}

export function signHubSession(secret: string, session: HubSession): string {
  const payload = [
    VERSION,
    session.competitionId,
    session.teamId,
    session.codeIssuedAt,
    session.expiresAt,
  ].join(".");
  return `${payload}.${signature(secret, payload)}`;
}

/** La sesión de la cookie, si está bien firmada y no ha vencido. */
export function readHubSession(
  secret: string,
  token: string | undefined,
  now: Date,
): HubSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== VERSION) return null;
  const [, competitionId = "", teamId = "", issued = "", expires = "", signed = ""] = parts;
  const expected = Buffer.from(signature(secret, parts.slice(0, 5).join(".")));
  const actual = Buffer.from(signed);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const codeIssuedAt = Number(issued);
  const expiresAt = Number(expires);
  if (!competitionId || !teamId) return null;
  if (!Number.isSafeInteger(codeIssuedAt) || !Number.isSafeInteger(expiresAt)) return null;
  if (expiresAt <= now.getTime()) return null;
  return { competitionId, teamId, codeIssuedAt, expiresAt };
}

/** Los fallos recientes de una IP, sin los que ya salieron de la ventana. */
export function recentFailures(times: readonly number[], now: Date): number[] {
  const since = now.getTime() - HUB_FAILURE_WINDOW_MS;
  return times.filter((time) => time > since);
}
