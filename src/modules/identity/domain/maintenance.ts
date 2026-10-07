import { and, isNotNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accessGrant, loginAttempt, otpChallenge, session } from "../schema";
import { OTP_FAILED_WINDOW_MS } from "./pure";

// Depuración diaria (ADR-012, prune): sesiones vencidas, retos de OTP viejos y, desde ADR-051,
// intentos de ingreso y enlaces de acceso que ya no pueden servir. Lo que hay que conservar de un
// enlace —quién lo emitió, para quién y si se usó— vive en la auditoría, no en esta tabla.

export interface PruneIdentityResult {
  sessions: number;
  challenges: number;
  attempts: number;
  grants: number;
}

export async function pruneIdentity(now = new Date()): Promise<PruneIdentityResult> {
  const db = getDb();
  const sessions = await db
    .delete(session)
    .where(lt(session.expiresAt, now))
    .returning({ id: session.id });
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  // Los retos se conservan toda la ventana del tope acumulado (ADR-113, regla 3): sus intentos son
  // la cuenta de códigos equivocados del correo, y borrarlos antes levantaría el tope.
  const windowAgo = new Date(now.getTime() - OTP_FAILED_WINDOW_MS);
  const challenges = await db
    .delete(otpChallenge)
    .where(or(lt(otpChallenge.expiresAt, windowAgo), lt(otpChallenge.createdAt, windowAgo)))
    .returning({ id: otpChallenge.id });
  // La ventana de los límites es de 15 minutos: un día es margen de sobra para diagnosticar.
  const attempts = await db
    .delete(loginAttempt)
    .where(lt(loginAttempt.createdAt, dayAgo))
    .returning({ id: loginAttempt.id });
  const grants = await db
    .delete(accessGrant)
    .where(
      or(
        lt(accessGrant.expiresAt, dayAgo),
        and(isNotNull(accessGrant.consumedAt), lt(accessGrant.consumedAt, dayAgo)),
      ),
    )
    .returning({ id: accessGrant.id });
  return {
    sessions: sessions.length,
    challenges: challenges.length,
    attempts: attempts.length,
    grants: grants.length,
  };
}
