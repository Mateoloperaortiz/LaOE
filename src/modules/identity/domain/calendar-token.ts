import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type Executor, runCommand, SYSTEM_ACTOR, type Tx } from "@/db/tx";
import { canParticipate, getMembershipRef, lockMembershipCycle } from "@/modules/people";
import { calendarToken } from "../schema";
import { ForbiddenError } from "./errors";

// Token del calendario personal (ADR-038 regla 12): una capacidad de solo lectura sobre la agenda
// propia, en claro para que Ajustes muestre siempre la URL; regenerarlo invalida el anterior.

export const CALENDAR_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Toma el candado del ciclo de membresía y exige que la persona participe hoy. Quien escribe un token
 * lo hace con este candado tomado: la baja y la anonimización lo toman antes de confirmar, así que un
 * token no nace de una membresía que se leyó activa y ya no lo es (ADR-116 regla 15).
 */
async function lockTokenHolder(tx: Tx, personId: string): Promise<void> {
  const state = await lockMembershipCycle(tx, personId);
  if (!state || state.anonymizedAt || !canParticipate(state.status)) {
    throw new ForbiddenError();
  }
}

/** El token vigente de la persona; se crea al primer uso. */
export async function getOrCreateCalendarToken(personId: string): Promise<string> {
  if (!canParticipate((await getMembershipRef(personId))?.status)) {
    throw new ForbiddenError();
  }
  const [existing] = await getDb()
    .select({ token: calendarToken.token })
    .from(calendarToken)
    .where(eq(calendarToken.personId, personId))
    .limit(1);
  if (existing) {
    return existing.token;
  }
  // Leer no toma el candado; crear sí, y vuelve a mirar la membresía con él tomado.
  return runCommand(SYSTEM_ACTOR, async (ctx) => {
    await lockTokenHolder(ctx.tx, personId);
    const token = newToken();
    await ctx.tx
      .insert(calendarToken)
      .values({ personId, token })
      .onConflictDoNothing({ target: calendarToken.personId });
    const [row] = await ctx.tx
      .select({ token: calendarToken.token })
      .from(calendarToken)
      .where(eq(calendarToken.personId, personId))
      .limit(1);
    return row?.token ?? token;
  });
}

/** Regenera el token del actor: el enlace anterior deja de funcionar. */
export async function rotateCalendarTokenAs(actor: Actor): Promise<string> {
  const personId = actor.personId;
  if (!personId) {
    throw new Error("Sin persona");
  }
  const token = newToken();
  await runCommand(actor, async (ctx) => {
    await lockTokenHolder(ctx.tx, personId);
    await ctx.tx
      .insert(calendarToken)
      .values({ personId, token })
      .onConflictDoUpdate({
        target: calendarToken.personId,
        set: { token, createdAt: new Date(), lastUsedAt: null },
      });
    await ctx.audit({
      action: "calendar-token.rotated",
      entityType: "calendar_token",
      entityId: personId,
    });
  });
  return token;
}

/** Persona dueña del token, estampando el último uso; null si no existe. */
export async function resolveCalendarToken(
  token: string,
  now = new Date(),
): Promise<string | null> {
  if (!CALENDAR_TOKEN.test(token)) {
    return null;
  }
  const db = getDb();
  const [row] = await db
    .select({ personId: calendarToken.personId })
    .from(calendarToken)
    .where(eq(calendarToken.token, token))
    .limit(1);
  if (!row) {
    return null;
  }
  await db.update(calendarToken).set({ lastUsedAt: now }).where(eq(calendarToken.token, token));
  return row.personId;
}

/**
 * Retira el token de quien sale o se anonimiza (ADR-116 regla 15): el enlace viejo no queda dormido
 * ni revive si la persona vuelve. Devuelve cuántos borró.
 */
export async function deleteCalendarTokenFor(exec: Executor, personId: string): Promise<number> {
  const rows = await exec
    .delete(calendarToken)
    .where(eq(calendarToken.personId, personId))
    .returning({ id: calendarToken.id });
  return rows.length;
}

/**
 * Retira los tokens que ya no deberían existir (ADR-116 regla 15): los de quien salió o fue
 * anonimizado antes de que la baja los borrara, y los que un handler no haya alcanzado. Pasa por
 * quienes tienen token, que son a lo sumo los miembros de hoy, y decide cada borrado con el candado
 * del ciclo de membresía tomado y el estado vigente: no se lleva el enlace de quien acaba de volver.
 * Devuelve cuántos borró.
 */
export async function pruneCalendarTokens(): Promise<number> {
  const holders = await getDb().select({ personId: calendarToken.personId }).from(calendarToken);
  let deleted = 0;
  for (const { personId } of holders) {
    deleted += await runCommand(SYSTEM_ACTOR, async (ctx) => {
      const state = await lockMembershipCycle(ctx.tx, personId);
      if (state && !state.anonymizedAt && state.status !== "INACTIVE") {
        return 0;
      }
      const rows = await ctx.tx
        .delete(calendarToken)
        .where(eq(calendarToken.personId, personId))
        .returning({ id: calendarToken.id });
      return rows.length;
    });
  }
  return deleted;
}
