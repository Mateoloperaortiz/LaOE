import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Reglas de acceso sin I/O (ADR-010): códigos, hashes, tokens, destino seguro y dispositivo.

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_WINDOW_MS = 15 * 60_000;
export const OTP_MAX_PER_EMAIL = 5;
export const OTP_MAX_PER_IP = 12;
export const SESSION_REMEMBERED_MS = 90 * 24 * 60 * 60_000;
export const SESSION_SHORT_MS = 24 * 60 * 60_000;
export const SESSION_TOUCH_INTERVAL_MS = 10 * 60_000;
export const STEP_UP_WINDOW_MS = 15 * 60_000;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isInstitutionalEmail(email: string, domains: readonly string[]): boolean {
  const domain = email.split("@")[1];
  return domain !== undefined && domains.includes(domain);
}

/** Seis dígitos aleatorios; fuera de producción puede fijarse con OTP_FIXED_CODE. */
export function generateCode(fixed?: string): string {
  return fixed ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(secret: string, email: string, code: string): string {
  return createHash("sha256").update(`${secret}:${email}:${code}`).digest("hex");
}

export function codeMatches(
  expectedHash: string,
  secret: string,
  email: string,
  code: string,
): boolean {
  const actual = Buffer.from(hashCode(secret, email, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Solo rutas del mismo origen; nunca /ingresar ni /api (05-acceso.md). */
export function safeNextPath(input: unknown, fallback = "/app"): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 2_000) {
    return fallback;
  }
  if (!input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\")) {
    return fallback;
  }
  if (/\s/.test(input)) {
    return fallback;
  }
  const path = input.split(/[?#]/)[0] ?? "";
  const blocked = ["/ingresar", "/api"];
  if (blocked.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return fallback;
  }
  return input;
}

export interface DeviceDescription {
  browser: string | null;
  os: string | null;
}

function detectOs(userAgent: string): string | null {
  if (/iPhone|iPad/.test(userAgent)) return "iPhone";
  if (/Android/.test(userAgent)) return "Android";
  if (/Mac OS X/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Linux/.test(userAgent)) return "Linux";
  return null;
}

function detectBrowser(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return null;
}

/** Descripción corta del dispositivo para la lista de sesiones; sin librerías. */
export function describeUserAgent(userAgent: string | null): DeviceDescription {
  if (!userAgent) {
    return { browser: null, os: null };
  }
  return { browser: detectBrowser(userAgent), os: detectOs(userAgent) };
}
