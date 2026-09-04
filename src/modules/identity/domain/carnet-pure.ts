import { createHmac, timingSafeEqual } from "node:crypto";

// Token del carnet (ADR-034 regla 10): `oe1.<personId>.<vence en minutos unix>.<HMAC-SHA256 base64url>`
// firmado con SESSION_SECRET y vigente 24 horas. Puro: la consola anfitrión de la fase 3 lo verifica igual.

export const CARNET_PREFIX = "oe1";
export const CARNET_TTL_MINUTES = 24 * 60;

const PERSON_ID = /^[a-z0-9]{10,40}$/;
const MINUTES = /^\d{1,12}$/;

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export interface SignedCarnet {
  token: string;
  expiresAt: Date;
}

export function signCarnet(
  personId: string,
  options: { secret: string; now?: Date; ttlMinutes?: number },
): SignedCarnet {
  if (!PERSON_ID.test(personId)) {
    throw new Error("personId inválido para el carnet");
  }
  const now = options.now ?? new Date();
  const ttl = options.ttlMinutes ?? CARNET_TTL_MINUTES;
  const expMinutes = Math.floor(now.getTime() / 60_000) + ttl;
  const payload = `${CARNET_PREFIX}.${personId}.${expMinutes}`;
  const sig = signature(payload, options.secret).toString("base64url");
  return { token: `${payload}.${sig}`, expiresAt: new Date(expMinutes * 60_000) };
}

export type CarnetVerification =
  | { ok: true; personId: string; expiresAt: Date }
  | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" };

export function verifyCarnet(
  token: string,
  options: { secret: string; now?: Date },
): CarnetVerification {
  const parts = token.split(".");
  const [prefix, personId, minutes, sig] = parts;
  if (
    parts.length !== 4 ||
    prefix !== CARNET_PREFIX ||
    !personId ||
    !minutes ||
    !sig ||
    !PERSON_ID.test(personId) ||
    !MINUTES.test(minutes)
  ) {
    return { ok: false, reason: "MALFORMED" };
  }
  const expected = signature(`${prefix}.${personId}.${minutes}`, options.secret);
  let actual: Buffer;
  try {
    actual = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
  const expiresAt = new Date(Number.parseInt(minutes, 10) * 60_000);
  const now = options.now ?? new Date();
  if (expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }
  return { ok: true, personId, expiresAt };
}
