import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { APP_SCREEN, internalPath } from "@/shared/lib/internal-path";
import { COMMON_PASSWORDS } from "../data/common-passwords";

// Reglas de acceso sin I/O (ADR-010, ADR-051): códigos, contraseñas, hashes, tokens, destino
// seguro y dispositivo.

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_WINDOW_MS = 15 * 60_000;
export const OTP_MAX_PER_EMAIL = 5;
export const OTP_MAX_PER_IP = 12;
export const OTP_FAILED_WINDOW_MS = 24 * 60 * 60_000;
export const OTP_MAX_FAILED_PER_EMAIL = 15;
export const SESSION_REMEMBERED_MS = 90 * 24 * 60 * 60_000;
export const SESSION_SHORT_MS = 24 * 60 * 60_000;
export const SESSION_TOUCH_INTERVAL_MS = 10 * 60_000;
export const STEP_UP_WINDOW_MS = 15 * 60_000;
export const PASSWORD_MIN_LENGTH = 10;
export const ACCESS_GRANT_TTL_MS = 60 * 60_000;
export const LOGIN_MAX_PER_EMAIL = 10;
export const LOGIN_MAX_PER_IP = 30;
// Contraseñas equivocadas de quien ya tiene sesión (ADR-114, regla 2): los números del ingreso,
// en una cuenta aparte.
export const PERSON_PASSWORD_MAX_FAILED = 10;
export const PERSON_PASSWORD_WINDOW_MS = 15 * 60_000;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Clave del contador de contraseñas equivocadas de quien tiene sesión (ADR-114, regla 2). Se guarda
 * donde el ingreso sin sesión guarda el correo y no puede ser uno: `normalizeEmail` nunca devuelve
 * una mayúscula, así que nadie sin sesión escribe ni cuenta esta clave.
 */
export function personAttemptKey(personId: string): string {
  return `PERSON:${personId}`;
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

/**
 * Intentos que trae un código nuevo sin pasar el tope acumulado del correo (ADR-113, regla 3): los
 * de siempre o, si son menos, los que le quedan al correo en la ventana. Cero es no emitir, y una
 * cuenta que no es un número no da intentos: el tope falla cerrado.
 */
export function otpAttemptBudget(failedInWindow: number): number {
  const left = OTP_MAX_FAILED_PER_EMAIL - failedInWindow;
  return left >= 1 ? Math.min(OTP_MAX_ATTEMPTS, Math.floor(left)) : 0;
}

/**
 * Hash de un reto señuelo (ADR-113, regla 2): tiene la forma de un SHA-256 y no sale de ningún
 * código, así que ninguno lo cumple.
 */
export function decoyCodeHash(): string {
  return randomBytes(32).toString("hex");
}

// Contraseña propia (ADR-051, reglas 1 y 12). `N = 2^15` es un punto medio deliberado entre la
// guía de OWASP y un contenedor de Railway que además atiende requests: `2^17` reserva más de
// 128 MiB por hash y convierte el ingreso en un vector de agotamiento de memoria.
const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const derive = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** `scrypt$N$r$p$sal$hash`: los parámetros viajan en el hash, así que subirlos no exige migración. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const options = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM };
  const hash = await derive(password, salt, SCRYPT_KEYLEN, options);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** Verifica contra los parámetros guardados en el propio hash, no contra los de hoy. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  const expected = Buffer.from(rawHash, "base64url");
  const actual = await derive(password, Buffer.from(rawSalt, "base64url"), expected.length, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Gasta el mismo tiempo que una verificación real cuando no hay credencial, para que el ingreso
 * no distinga por tiempo a quien está en el roster de quien no (ADR-051, regla 10).
 */
export async function burnPasswordTime(): Promise<void> {
  const options = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM };
  await derive("", randomBytes(16), SCRYPT_KEYLEN, options);
}

export type PasswordProblem = "SHORT" | "COMMON" | "PERSONAL";

export interface PasswordContext {
  email: string;
  names: readonly string[];
}

/** Quita tildes y baja a minúsculas para comparar contra la lista y contra los datos propios. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Sin composición forzada ni rotación obligatoria (NIST 800-63B): solo longitud, lista corta de
 * comunes y nada que lleve el correo o el nombre de la persona (ADR-051, regla 11).
 */
export function checkPassword(password: string, context: PasswordContext): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return "SHORT";
  }
  const folded = fold(password);
  if (COMMON_PASSWORDS.has(folded) || new Set(folded).size === 1) {
    return "COMMON";
  }
  const local = fold(context.email).split("@")[0] ?? "";
  const tokens = [local, ...context.names.map(fold)]
    .flatMap((value) => value.split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 4);
  if (tokens.some((token) => folded.includes(token))) {
    return "PERSONAL";
  }
  return null;
}

/** Token opaco del enlace de acceso: en base solo vive su `hashToken` (ADR-051, regla 3). */
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Destino después del ingreso o de un paso de seguridad: solo una pantalla de la aplicación, nunca
 * /ingresar ni /api (05-acceso.md). La ruta la decide `internalPath` (ADR-114, regla 1).
 */
export function safeNextPath(input: unknown, fallback = "/app"): string {
  if (typeof input !== "string" || input.length > 2_000) {
    return fallback;
  }
  return internalPath(input, APP_SCREEN) ?? fallback;
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
