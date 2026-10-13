import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { setConfig } from "@/modules/system";

/**
 * Deja el lote de las campañas en `value` correos por minuto. Va por el comando `setConfig` y no por
 * `seedConfig` de la fábrica: el comando le avisa a la caché de configuración de este proceso, y una
 * fila escrita por debajo dejaría al envío leyendo el lote de antes.
 */
export function setPerMinute(value: number): Promise<void> {
  return runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "campaigns.perMinute", value));
}
