import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { appConfig } from "../schema";

// Configuración del sistema (03-modelo-de-datos.md, AppConfig): claves conocidas con su esquema,
// leídas con una caché corta y escritas por comando auditado.

export const CONFIG = {
  "committees.min": z.number().int().min(1),
  "committees.max": z.number().int().min(1),
  "assemblies.requiredOrdinary": z.number().int().min(0),
  "permanence.assembliesForCredit": z.number().int().min(0),
  "score.shrinkK": z.number().min(0),
  "checkin.rotatingCodeDefault": z.boolean(),
  "permanence.threshold.active": z.number().min(0).max(100),
  "permanence.threshold.new": z.number().min(0).max(100),
  "permanence.threshold.probation": z.number().min(0).max(100),
  "permanence.threshold.transfer": z.number().min(0).max(100),
  "permanence.probationMargin": z.number().min(0),
  "privacy.policyVersion": z.string().min(1),
  "backup.lastRunAt": z.string().datetime({ offset: true }).nullable(),
  "backup.status": z
    .object({
      ok: z.boolean(),
      checkedAt: z.string(),
      lastRunAt: z.string().nullable(),
      message: z.string(),
    })
    .nullable(),
} as const;

export type ConfigKey = keyof typeof CONFIG;
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG)[K]>;

const TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; until: number }>();

export async function getConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K> | null> {
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) {
    return cached.value as ConfigValue<K> | null;
  }
  const [row] = await getDb()
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key));
  const value = row === undefined ? null : (CONFIG[key].parse(row.value) as ConfigValue<K>);
  cache.set(key, { value, until: Date.now() + TTL_MS });
  return value;
}

/** Lectura obligatoria: falla si la clave no está sembrada. */
export async function requireConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K>> {
  const value = await getConfig(key);
  if (value === null) {
    throw new Error(`Falta la configuración ${key}`);
  }
  return value;
}

export async function setConfig<K extends ConfigKey>(
  ctx: CommandContext,
  key: K,
  value: ConfigValue<K>,
): Promise<void> {
  const parsed = CONFIG[key].parse(value);
  const [before] = await ctx.tx
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key));
  await ctx.tx
    .insert(appConfig)
    .values({ key, value: parsed, updatedById: ctx.actor.personId })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: parsed, updatedById: ctx.actor.personId, updatedAt: new Date() },
    });
  await ctx.audit({
    action: "config.updated",
    entityType: "app_config",
    entityId: key,
    before: before?.value ?? null,
    after: parsed,
  });
  cache.delete(key);
}
