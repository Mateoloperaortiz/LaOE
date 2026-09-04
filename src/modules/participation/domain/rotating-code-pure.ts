import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Código rotativo (ADR-035 regla 7): como un TOTP de 6 dígitos que cambia cada minuto, derivado del
// secreto de la ocasión con HMAC-SHA256 y truncamiento dinámico. Puro: la consola lo muestra y el
// check-in lo verifica con la misma función; se aceptan la ventana actual y la anterior.

export const ROTATING_CODE_STEP_SECONDS = 60;
export const ROTATING_CODE_DIGITS = 6;
const CODE = /^[0-9]{6}$/;

export function newRotatingSecret(): string {
  return randomBytes(32).toString("base64url");
}

function counterAt(at: Date, stepSeconds: number): number {
  return Math.floor(at.getTime() / 1000 / stepSeconds);
}

function codeForCounter(secret: string, occasionId: string, counter: number): string {
  const digest = createHmac("sha256", secret).update(`${occasionId}:${counter}`).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** ROTATING_CODE_DIGITS).padStart(ROTATING_CODE_DIGITS, "0");
}

/** El código vigente en un instante. */
export function rotatingCodeAt(
  secret: string,
  occasionId: string,
  at: Date,
  stepSeconds = ROTATING_CODE_STEP_SECONDS,
): string {
  return codeForCounter(secret, occasionId, counterAt(at, stepSeconds));
}

/** Acepta el código de la ventana actual y el de `tolerance` ventanas anteriores, en tiempo constante. */
export function verifyRotatingCode(
  secret: string,
  occasionId: string,
  code: string,
  at: Date,
  options: { stepSeconds?: number; tolerance?: number } = {},
): boolean {
  const stepSeconds = options.stepSeconds ?? ROTATING_CODE_STEP_SECONDS;
  const tolerance = options.tolerance ?? 1;
  const candidate = code.trim();
  if (!CODE.test(candidate)) {
    return false;
  }
  const current = counterAt(at, stepSeconds);
  let ok = false;
  for (let back = 0; back <= tolerance; back += 1) {
    const expected = Buffer.from(codeForCounter(secret, occasionId, current - back));
    if (timingSafeEqual(expected, Buffer.from(candidate))) {
      ok = true;
    }
  }
  return ok;
}

/** Segundos que faltan para que el código cambie. */
export function secondsUntilRotation(at: Date, stepSeconds = ROTATING_CODE_STEP_SECONDS): number {
  const elapsed = Math.floor(at.getTime() / 1000) % stepSeconds;
  return stepSeconds - elapsed;
}
