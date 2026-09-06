import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import { calendarToken } from "../schema";

// Token del calendario personal (ADR-038 regla 12): una capacidad de solo lectura sobre la agenda
// propia, en claro para que Ajustes muestre siempre la URL; regenerarlo invalida el anterior.

export const CALENDAR_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** El token vigente de la persona; se crea al primer uso. */
export async function getOrCreateCalendarToken(personId: string): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select({ token: calendarToken.token })
    .from(calendarToken)
    .where(eq(calendarToken.personId, personId))
    .limit(1);
  if (existing) {
    return existing.token;
  }
  const token = newToken();
  await db
    .insert(calendarToken)
    .values({ personId, token })
    .onConflictDoNothing({ target: calendarToken.personId });
  const [row] = await db
    .select({ token: calendarToken.token })
    .from(calendarToken)
    .where(eq(calendarToken.personId, personId))
    .limit(1);
  return row?.token ?? token;
}

/** Regenera el token del actor: el enlace anterior deja de funcionar. */
export async function rotateCalendarTokenAs(actor: Actor): Promise<string> {
  const personId = actor.personId;
  if (!personId) {
    throw new Error("Sin persona");
  }
  const token = newToken();
  await runCommand(actor, async (ctx) => {
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
