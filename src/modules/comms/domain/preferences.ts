import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { notificationPreference } from "../schema";
import { DEFAULT_PREFERENCES, type PreferenceFlags } from "./pure";

// Preferencias de notificación (ADR-038 regla 5): la fila se crea perezosa con todo encendido y un
// token de baja propio; la propia persona las cambia desde Ajustes.

export const preferencesInputSchema = z.object({
  emailCampaigns: z.boolean(),
  pushAnnouncements: z.boolean(),
  pushPoints: z.boolean(),
  pushReminders: z.boolean(),
});

export type PreferencesInput = z.infer<typeof preferencesInputSchema>;

export interface PreferencesView extends PreferenceFlags {
  personId: string;
  unsubscribeToken: string | null;
  updatedAt: Date | null;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function toFlags(row: typeof notificationPreference.$inferSelect): PreferenceFlags {
  return {
    emailCampaigns: row.emailCampaigns,
    pushAnnouncements: row.pushAnnouncements,
    pushPoints: row.pushPoints,
    pushReminders: row.pushReminders,
  };
}

/** Preferencias de una persona; sin fila devuelve los valores por defecto sin crear nada. */
export async function getPreferences(personId: string): Promise<PreferencesView> {
  const [row] = await getDb()
    .select()
    .from(notificationPreference)
    .where(eq(notificationPreference.personId, personId))
    .limit(1);
  if (!row) {
    return { personId, ...DEFAULT_PREFERENCES, unsubscribeToken: null, updatedAt: null };
  }
  return {
    personId,
    ...toFlags(row),
    unsubscribeToken: row.unsubscribeToken,
    updatedAt: row.updatedAt,
  };
}

/** Preferencias de varias personas de una vez (el bus y las campañas); los que faltan van por defecto. */
export async function listPreferencesFor(
  personIds: string[],
): Promise<Map<string, PreferenceFlags>> {
  const result = new Map<string, PreferenceFlags>();
  if (personIds.length === 0) {
    return result;
  }
  const rows = await getDb()
    .select()
    .from(notificationPreference)
    .where(inArray(notificationPreference.personId, personIds));
  for (const row of rows) {
    result.set(row.personId, toFlags(row));
  }
  for (const personId of personIds) {
    if (!result.has(personId)) {
      result.set(personId, { ...DEFAULT_PREFERENCES });
    }
  }
  return result;
}

/** Crea la fila con los valores por defecto si falta y devuelve el token de baja. */
export async function ensurePreferences(
  exec: CommandContext["tx"] | ReturnType<typeof getDb>,
  personId: string,
): Promise<string> {
  const [existing] = await exec
    .select({ token: notificationPreference.unsubscribeToken })
    .from(notificationPreference)
    .where(eq(notificationPreference.personId, personId))
    .limit(1);
  if (existing) {
    return existing.token;
  }
  const token = newToken();
  await exec
    .insert(notificationPreference)
    .values({ personId, unsubscribeToken: token })
    .onConflictDoNothing({ target: notificationPreference.personId });
  const [row] = await exec
    .select({ token: notificationPreference.unsubscribeToken })
    .from(notificationPreference)
    .where(eq(notificationPreference.personId, personId))
    .limit(1);
  return row?.token ?? token;
}

/** La persona cambia sus propias preferencias (Ajustes). */
export async function updatePreferencesAs(actor: Actor, input: PreferencesInput): Promise<void> {
  const personId = actor.personId;
  if (!personId) {
    throw new Error("Sin persona");
  }
  const parsed = preferencesInputSchema.parse(input);
  await runCommand(actor, async (ctx) => {
    await ensurePreferences(ctx.tx, personId);
    const [before] = await ctx.tx
      .select()
      .from(notificationPreference)
      .where(eq(notificationPreference.personId, personId));
    await ctx.tx
      .update(notificationPreference)
      .set(parsed)
      .where(eq(notificationPreference.personId, personId));
    await ctx.audit({
      action: "notification-preference.updated",
      entityType: "notification_preference",
      entityId: personId,
      before: before ? toFlags(before) : null,
      after: parsed,
    });
  });
}

/** Baja de campañas por el token del pie del correo (sin sesión); devuelve false si no existe. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return false;
  }
  const [row] = await getDb()
    .select({ personId: notificationPreference.personId })
    .from(notificationPreference)
    .where(eq(notificationPreference.unsubscribeToken, token))
    .limit(1);
  if (!row) {
    return false;
  }
  await runCommand({ personId: row.personId }, async (ctx) => {
    await ctx.tx
      .update(notificationPreference)
      .set({ emailCampaigns: false })
      .where(eq(notificationPreference.personId, row.personId));
    await ctx.audit({
      action: "notification-preference.unsubscribed",
      entityType: "notification_preference",
      entityId: row.personId,
      after: { emailCampaigns: false, source: "TOKEN" },
    });
  });
  return true;
}

/** Al salir de la OE o anonimizarse (ADR-030): las preferencias no son historia. */
export async function deletePreferencesFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(notificationPreference)
    .where(eq(notificationPreference.personId, personId))
    .returning({ id: notificationPreference.id });
  return rows.length;
}
