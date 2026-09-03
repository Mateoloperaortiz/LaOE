// Reintentos del outbox (ADR-012): 1 min, 5 min, 30 min, 2 h, 12 h; dead letter tras cinco fallos.

export const BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export const MAX_ATTEMPTS = BACKOFF_MS.length;

/** Espera antes del siguiente intento dado el número de intentos ya hechos (1 tras el primer fallo). */
export function backoffFor(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 60_000;
}

export function isDeadAfter(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}
