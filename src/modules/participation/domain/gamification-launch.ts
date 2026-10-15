import { sql } from "drizzle-orm";
import { type Actor, runCommand } from "@/db/tx";
import { clearConfigCache, readConfigNow, requireConfigIn, setConfig } from "@/modules/system";

/** La preparación contable no inicia los bonos: los inicia la primera activación efectiva. */
export async function getGamificationLaunch(): Promise<{ launchedAt: string | null }> {
  const launch = await readConfigNow("gamification.launch");
  if (!launch) throw new Error("Falta el estado de lanzamiento de la gamificación");
  return { launchedAt: launch.at };
}

/**
 * Activa la gamificación preparada y fija su primer lanzamiento en la misma transacción. Apagar
 * retos después no borra esa fecha ni suspende la constancia ya lanzada; reactivar no paga historia
 * anterior ni mueve el corte contable. Esa regla vive aquí, no en el setter genérico de config.
 */
export async function setGamificationEnabledAs(actor: Actor, enabled: boolean): Promise<void> {
  try {
    await runCommand(actor, async (ctx) => {
      await ctx.tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('gamification-launch', 0))`,
      );
      const launch = await requireConfigIn(ctx, "gamification.launch");
      if (enabled && launch.at === null)
        await setConfig(ctx, "gamification.launch", { at: new Date().toISOString() });
      await setConfig(ctx, "gamification.enabled", enabled);
    });
  } finally {
    clearConfigCache();
  }
}
