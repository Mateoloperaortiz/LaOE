import { lt, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { otpChallenge, session } from "../schema";

// Depuración diaria (ADR-012, prune): sesiones vencidas y retos de OTP viejos.

export async function pruneIdentity(
  now = new Date(),
): Promise<{ sessions: number; challenges: number }> {
  const db = getDb();
  const sessions = await db
    .delete(session)
    .where(lt(session.expiresAt, now))
    .returning({ id: session.id });
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const challenges = await db
    .delete(otpChallenge)
    .where(or(lt(otpChallenge.expiresAt, dayAgo), lt(otpChallenge.createdAt, dayAgo)))
    .returning({ id: otpChallenge.id });
  return { sessions: sessions.length, challenges: challenges.length };
}
