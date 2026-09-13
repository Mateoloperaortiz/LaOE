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
  // ADR-060 regla 1: banda de prueba por condición (Est. art. 7.5, 8.3, 11.4 y 11.5).
  "permanence.probationMargins": z.object({
    active: z.number().min(0),
    new: z.number().min(0),
    probation: z.number().min(0),
    transfer: z.number().min(0),
  }),
  // Fase 4 (ADR-036): ventana de evaluación antes del fin del término y días del aviso de cierre.
  "permanence.evaluationWindowDays": z.number().int().min(0),
  "permanence.warningDays": z.number().int().min(0),
  "privacy.policyVersion": z.string().min(1),
  "privacy.deletionDays": z.number().int().min(1),
  "requests.taskDays": z.number().int().min(1),
  "onboarding.steps": z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      auto: z
        .enum(["NORMATIVA_READ", "FIRST_INTEGRATION", "PUSH_ENABLED", "NEW_MEMBER_TASK"])
        .nullable(),
    }),
  ),
  // Fase 3 (ADR-035): cortes de nivel de GH Points, ventana de check-in por defecto y cierre automático.
  "points.levels": z.array(z.number().int().min(0)).min(1),
  "checkin.defaultWindow": z.object({
    opensMinutesBefore: z.number().int().min(0),
    closesMinutesAfter: z.number().int().min(0),
  }),
  "occasions.autoCloseHours": z.number().int().min(1),
  // Fase 6 (ADR-038): lotes de campañas, horas de los recordatorios y encuesta tras la ocasión.
  "campaigns.perMinute": z.number().int().min(1).max(200),
  "reminders.hours": z.object({
    today: z.number().int().min(0).max(23),
    eve: z.number().int().min(0).max(23),
  }),
  "survey.defaultFormId": z.string().min(1).nullable(),
  "survey.windowDays": z.number().int().min(1),
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
