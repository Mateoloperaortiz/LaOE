import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Actor } from "@/db/tx";
import { getEnv } from "@/env";
import { readConfigNow, reviseConfig, writeConfig } from "@/modules/system";
import type { QuotaReason } from "@/shared/adapters/mail";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { campaign, campaignRecipient } from "../schema";
import {
  campaignCeiling,
  campaignRoom,
  type QuotaCut,
  quotaCutInEffect,
  readQuotaCut,
  startOfNextDayIn,
  storeQuotaCut,
  transactionalReserve,
} from "./pure";
import { campaignDailyLimit, campaignProvider, QUOTA_CUT_KEY, sentTodayVia } from "./send";

// El cupo de correo de las campañas visto desde quien lo opera (ADR-116 reglas 19 y 20): lo que
// muestran la pantalla del cupo y la de una campaña en curso, y los dos comandos de un ADMIN.

const RESERVE_KEY = "campaigns.transactionalReserve";

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

/** La cuenta del cupo del día de las campañas, como la hace el lote (ADR-115 regla 5). */
export interface DailyQuotaStatus {
  /** El cupo del día del proveedor. */
  limit: number;
  /** El margen que rige para lo transaccional: el fijado o el de por defecto. */
  reserve: number;
  /** Con cuántos correos salidos hoy por el proveedor una campaña ya no manda otro. */
  ceiling: number;
  /** Lo que el proveedor aceptó hoy, transaccional y de campaña. */
  sentToday: number;
  /** Lo que algún lote tiene reclamado y sin resultado: ya tiene su lugar reservado. */
  claimed: number;
  /** Cuántos correos de campaña caben todavía hoy. */
  room: number;
  /** Cuándo vuelve a empezar la cuenta: la medianoche siguiente de la zona de la app. */
  resetsAt: Date;
}

export interface CampaignQuotaStatus {
  /** El proveedor por el que salen hoy las campañas. */
  provider: string;
  /** El margen fijado en la configuración, o `null` si rige el de por defecto. */
  reserveSetting: number | null;
  /** La cuenta del día, o `null` si ese proveedor no lleva un cupo del día acá. */
  daily: DailyQuotaStatus | null;
  /** El corte por cuota que a esta hora detiene los lotes, o `null`. */
  cut: QuotaCut | null;
}

/** Destinatarios que algún lote tiene reclamados y sin resultado, en las campañas en curso. */
async function claimedRecipients(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(campaignRecipient)
    .where(
      and(
        eq(campaignRecipient.status, "PENDING"),
        isNotNull(campaignRecipient.claimedAt),
        inArray(
          campaignRecipient.campaignId,
          db.select({ id: campaign.id }).from(campaign).where(eq(campaign.status, "SENDING")),
        ),
      ),
    );
  return row?.n ?? 0;
}

/**
 * El cupo de correo de las campañas a esa hora: por dónde salen, el margen, la cuenta del día y el
 * corte vigente. Es para mostrar: lee la configuración de la base y no de la caché, y cuenta sin el
 * candado del cupo, así que un lote que reclama en ese instante puede no estar contado todavía.
 */
export async function getCampaignQuotaStatus(now = new Date()): Promise<CampaignQuotaStatus> {
  const timeZone = getEnv().APP_TIMEZONE;
  const provider = campaignProvider();
  const limit = campaignDailyLimit();
  const [reserveSetting, storedCut] = await Promise.all([
    readConfigNow(RESERVE_KEY),
    readConfigNow(QUOTA_CUT_KEY),
  ]);
  const cut = quotaCutInEffect(readQuotaCut(storedCut, timeZone), provider, now);
  if (limit === null) {
    return { provider, reserveSetting, daily: null, cut };
  }
  const [sentToday, claimed] = await Promise.all([
    sentTodayVia(provider, now),
    claimedRecipients(),
  ]);
  const ceiling = campaignCeiling(limit, reserveSetting);
  return {
    provider,
    reserveSetting,
    daily: {
      limit,
      reserve: transactionalReserve(limit, reserveSetting),
      ceiling,
      sentToday,
      claimed,
      room: campaignRoom(ceiling, sentToday, claimed),
      resetsAt: startOfNextDayIn(timeZone, now),
    },
    cut,
  };
}

/**
 * Lo que detiene a los pendientes de una campaña en curso: un corte del proveedor, con su causa y su
 * final; el margen, cuando cubre todo el cupo del día; o el cupo de hoy, que ya no tiene lugar y vuelve
 * a contar a la medianoche.
 */
export type CampaignHold =
  | { by: "CUT"; provider: string; reason: QuotaReason; until: Date }
  | { by: "RESERVE" }
  | { by: "ROOM"; until: Date };

function holdOf(status: CampaignQuotaStatus): CampaignHold | null {
  if (status.cut) {
    const { provider, reason, until } = status.cut;
    return { by: "CUT", provider, reason, until };
  }
  if (status.daily === null || status.daily.room > 0) {
    return null;
  }
  return status.daily.ceiling === 0
    ? { by: "RESERVE" }
    : { by: "ROOM", until: status.daily.resetsAt };
}

export interface CampaignBacklog {
  /** Destinatarios de la campaña que siguen pendientes. */
  pending: number;
  /** Qué los detiene, o `null` si salen en los próximos lotes o no queda ninguno. */
  hold: CampaignHold | null;
}

/** Cuántos destinatarios le faltan a una campaña y qué los detiene a esa hora. */
export async function getCampaignBacklog(
  campaignId: string,
  now = new Date(),
): Promise<CampaignBacklog> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(campaignRecipient)
    .where(
      and(eq(campaignRecipient.campaignId, campaignId), eq(campaignRecipient.status, "PENDING")),
    );
  const pending = row?.n ?? 0;
  if (pending === 0) {
    return { pending, hold: null };
  }
  return { pending, hold: holdOf(await getCampaignQuotaStatus(now)) };
}

/**
 * Fija el margen del cupo del día que una campaña no toca (ADR-115 regla 5): un entero de cero en
 * adelante. Un margen igual o mayor que el cupo es válido y no deja salir ninguna campaña. Queda en la
 * auditoría como toda la configuración, y el lote siguiente de este proceso ya cuenta con él.
 */
export async function setTransactionalReserveAs(
  actor: Actor & { personId: string },
  scope: QuotaScope,
  value: number,
): Promise<void> {
  assertQuotaScope(actor, scope);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(t("T-3235"), "reserve");
  }
  await writeConfig(actor, RESERVE_KEY, value);
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
