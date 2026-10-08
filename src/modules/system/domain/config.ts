import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { appConfig } from "../schema";

// Configuración del sistema (03-modelo-de-datos.md, AppConfig): claves conocidas con su esquema,
// leídas con una caché corta y escritas por comando auditado.

/** El corte por cuota de las campañas con su causa (ADR-116 regla 19). */
const quotaCutSchema = z.object({
  provider: z.string().min(1),
  reason: z.enum(["BURST", "DAILY", "MONTHLY"]),
  at: z.string().datetime({ offset: true }),
  until: z.string().datetime({ offset: true }),
});

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
  // ADR-115 reglas 5 y 6: correos del cupo diario del proveedor que una campaña no toca, y el corte que
  // deja un rechazo por cuota. Ninguna se siembra: sin fila, el margen es un tercio del cupo y no hay
  // corte. El corte guarda el proveedor, la causa, la hora del lote que lo recibió y hasta cuándo dura
  // (ADR-116 regla 19), en `campaigns.quotaCut`. `campaigns.quotaExhaustedAt` es donde lo dejaban las
  // versiones anteriores, como una fecha sola: ya no se escribe y se lee como un corte de Resend por el
  // cupo del día. Admite también la forma con causa porque el ciclo 5 la escribió ahí antes de
  // publicarse, en bases de desarrollo.
  "campaigns.transactionalReserve": z.number().int().min(0),
  "campaigns.quotaCut": quotaCutSchema,
  "campaigns.quotaExhaustedAt": z.union([z.string().datetime({ offset: true }), quotaCutSchema]),
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
  // ADR-067: bandera, topes y valores por defecto de retos y boosters.
  "gamification.enabled": z.boolean(),
  "gamification.caps": z.object({
    daily: z.number().int().min(0).max(1000),
    weekly: z.number().int().min(0).max(5000),
  }),
  "gamification.defaults": z.object({
    trivia: z.number().int().min(0).max(20),
    presential: z.number().int().min(0).max(20),
    evidence: z.number().int().min(0).max(20),
    passPercent: z.number().int().min(1).max(100),
  }),
} as const;

export type ConfigKey = keyof typeof CONFIG;
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG)[K]>;

const TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; until: number }>();

/** El valor de una clave, validado, por la conexión que se le pase y sin caché; `null` si no tiene fila. */
async function readConfig<K extends ConfigKey>(
  db: Executor,
  key: K,
): Promise<ConfigValue<K> | null> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key));
  return row === undefined ? null : (CONFIG[key].parse(row.value) as ConfigValue<K>);
}

export async function getConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K> | null> {
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) {
    return cached.value as ConfigValue<K> | null;
  }
  const value = await readConfig(getDb(), key);
  cache.set(key, { value, until: Date.now() + TTL_MS });
  return value;
}

/**
 * El valor como está en la base en este momento, sin la caché (ADR-116 regla 20): para la pantalla
 * que opera una clave, que tiene que mostrar lo que otro proceso acaba de escribir. No guarda lo que
 * lee: quien decide con la clave sigue leyendo con `getConfig`.
 */
export function readConfigNow<K extends ConfigKey>(key: K): Promise<ConfigValue<K> | null> {
  return readConfig(getDb(), key);
}

/** Lectura obligatoria: falla si la clave no está sembrada. */
export async function requireConfig<K extends ConfigKey>(key: K): Promise<ConfigValue<K>> {
  const value = await getConfig(key);
  if (value === null) {
    throw new Error(`Falta la configuración ${key}`);
  }
  return value;
}

/**
 * La lectura obligatoria desde un comando, por la conexión de su transacción (ADR-115 regla 9). Con la
 * transacción abierta no se le pide otra conexión al pool: una ráfaga con más comandos que conexiones
 * las tiene todas tomadas, cada comando espera una más y ninguno la suelta. No pasa por la caché, ni
 * para leer ni para guardar: lo que ve una transacción puede no estar confirmado (ADR-113 regla 9).
 */
export async function requireConfigIn<K extends ConfigKey>(
  ctx: CommandContext,
  key: K,
): Promise<ConfigValue<K>> {
  const value = await readConfig(ctx.tx, key);
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
  // Adelanta la invalidación, pero no alcanza: hasta el commit la base sigue mostrando el valor anterior
  // y otra lectura lo vuelve a guardar. La que vale es la de `writeConfig`.
  cache.delete(key);
}

/**
 * Cambia una clave en su propio comando y suelta su entrada de la caché cuando la transacción ya terminó
 * (ADR-113 regla 9): una lectura que cayó antes del commit no deja el valor anterior guardado. Suelta
 * la entrada también si el comando falla: de más solo cuesta una lectura.
 */
export async function writeConfig<K extends ConfigKey>(
  actor: Actor,
  key: K,
  value: ConfigValue<K>,
): Promise<void> {
  try {
    await runCommand(actor, (ctx) => setConfig(ctx, key, value));
  } finally {
    cache.delete(key);
  }
}

/** Las claves que no se siembran y cuyo valor por defecto lo pone el código cuando no hay fila. */
export type ResettableConfigKey = "campaigns.transactionalReserve";

/**
 * Quita la fila de una clave que no se siembra, en su propio comando: vuelve a regir su valor por
 * defecto (ADR-116 regla 20). Queda en la auditoría como un cambio más, con el valor que tenía y nada
 * después. Sin fila no escribe y responde `false`. Suelta la caché igual que `writeConfig`.
 */
export async function resetConfig(actor: Actor, key: ResettableConfigKey): Promise<boolean> {
  try {
    return await runCommand(actor, async (ctx) => {
      const [before] = await ctx.tx
        .delete(appConfig)
        .where(eq(appConfig.key, key))
        .returning({ value: appConfig.value });
      if (!before) {
        return false;
      }
      await ctx.audit({
        action: "config.updated",
        entityType: "app_config",
        entityId: key,
        before: before.value,
        after: null,
      });
      return true;
    });
  } finally {
    cache.delete(key);
  }
}

/**
 * Cambia una clave según el valor que tiene, en su propio comando (ADR-115 regla 6). Lo lee por la
 * conexión del comando y bajo un candado por clave, que dura lo que la transacción: dos cambios a la vez
 * deciden uno después del otro, también cuando la clave todavía no tiene fila. `next` devuelve el valor
 * nuevo, o `undefined` para dejarla como está. Suelta la caché igual que `writeConfig`.
 */
export async function reviseConfig<K extends ConfigKey>(
  actor: Actor,
  key: K,
  next: (current: ConfigValue<K> | null) => ConfigValue<K> | undefined,
): Promise<void> {
  try {
    await runCommand(actor, async (ctx) => {
      await ctx.tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`config:${key}`}, 0))`,
      );
      const value = next(await readConfig(ctx.tx, key));
      if (value !== undefined) {
        await setConfig(ctx, key, value);
      }
    });
  } finally {
    cache.delete(key);
  }
}

/** Vacía la caché lectura: la usan las pruebas al truncar la base. */
export function clearConfigCache(): void {
  cache.clear();
}

/** Wrapper de comando para src/app (que no abre transacciones): setConfig auditado. */
export function setConfigAs<K extends ConfigKey>(
  actor: Actor & { personId: string },
  key: K,
  value: ConfigValue<K>,
): Promise<void> {
  return writeConfig(actor, key, value);
}
