import type { Actor } from "@/db/tx";
import { getEnv } from "@/env";
import { reviseConfig } from "@/modules/system";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { quotaCutInEffect, readQuotaCut, storeQuotaCut } from "./pure";
import { campaignProvider, QUOTA_CUT_KEY } from "./send";

// El cupo de correo de las campañas visto desde quien lo opera (ADR-116 regla 19).

/**
 * Con qué alcance se opera el cupo de correo. Es obligatorio, como el de las sanciones (ADR-112), y hoy
 * solo existe el de ADMIN.
 */
export type QuotaScope = { by: "ADMIN" };

/**
 * Solo pasa el alcance de ADMIN, a nombre de una persona. Otro alcance, uno que no se reconoce, ninguno
 * o un actor sin persona responden igual, antes de leer nada.
 */
function assertQuotaScope(actor: Actor, scope: QuotaScope): void {
  const by: unknown = (scope as { by?: unknown } | undefined)?.by;
  const personId: unknown = (actor as { personId?: unknown } | undefined)?.personId;
  if (by !== "ADMIN" || typeof personId !== "string" || personId.length === 0) {
    throw new DomainError(t("T-032"));
  }
}

/**
 * Levanta el corte por cuota que detiene las campañas, y responde si había uno vigente. Levantarlo es
 * adelantarle el final a este momento: el corte queda guardado con su causa y ya no detiene a nadie.
 * Lo mira y lo levanta bajo el candado de la clave, en el mismo comando: si mientras tanto un lote
 * escribe otro rechazo, uno de los dos decide después del otro. Queda en la auditoría como toda la
 * configuración, con el final que tenía. No promete que el proveedor acepte: si vuelve a rechazar, el
 * corte se escribe otra vez.
 */
export async function liftCampaignQuotaCutAs(
  actor: Actor & { personId: string },
  scope: QuotaScope,
  now = new Date(),
): Promise<boolean> {
  assertQuotaScope(actor, scope);
  const timeZone = getEnv().APP_TIMEZONE;
  const provider = campaignProvider();
  let lifted = false;
  await reviseConfig(actor, QUOTA_CUT_KEY, (current) => {
    const cut = quotaCutInEffect(readQuotaCut(current, timeZone), provider, now);
    if (cut === null) {
      return undefined;
    }
    lifted = true;
    return storeQuotaCut({ ...cut, until: now });
  });
  return lifted;
}
