import type { NotificationKind } from "@/domain-events/comms";
import type { QuotaReason } from "@/shared/adapters/mail";
import { splitTitleBody } from "@/shared/copy/render";
import { atHourIn, dateKeyIn, startOfNextDayIn, startOfTodayIn } from "@/shared/lib/dates-pure";

// Reglas de comunicaciones sin I/O (ADR-023, ADR-038).

export type Route = "primary" | "overflow";

/** Resend mientras el contador del día esté por debajo del límite; desde ahí, SES. */
export function chooseRoute(
  sentTodayViaPrimary: number,
  dailyLimit: number,
  overflowAvailable: boolean,
): Route {
  if (!overflowAvailable) {
    return "primary";
  }
  return sentTodayViaPrimary >= dailyLimit ? "overflow" : "primary";
}

/**
 * Cuántos correos pueden haber salido hoy por el proveedor para que una campaña todavía mande otro
 * (ADR-115 regla 5): el cupo diario menos el margen reservado para lo transaccional. Sin margen fijado
 * es un tercio del cupo, hacia arriba; un margen mayor que el cupo no deja salir ninguna.
 */
export function campaignCeiling(dailyLimit: number, reserve: number | null): number {
  return Math.max(0, dailyLimit - transactionalReserve(dailyLimit, reserve));
}

/** El margen que rige: el fijado o, si no hay ninguno, un tercio del cupo hacia arriba. */
export function transactionalReserve(dailyLimit: number, reserve: number | null): number {
  return reserve ?? Math.ceil(dailyLimit / 3);
}

/**
 * Cuántos correos de campaña caben todavía hoy, que es el día del proveedor: lo que un lote reclamó y
 * no ha enviado ya cuenta.
 */
export function campaignRoom(ceiling: number, sentToday: number, claimed: number): number {
  return Math.max(0, ceiling - sentToday - claimed);
}

// El corte por cuota (ADR-116 regla 19, que enmienda ADR-115 regla 6).

/** Lo que deja escrito un rechazo por cuota: quién rechazó, por qué, la hora del lote y hasta cuándo. */
export interface QuotaCut {
  provider: string;
  reason: QuotaReason;
  at: Date;
  until: Date;
}

/**
 * Como se guarda: con su causa en `campaigns.quotaCut`, o la fecha sola que las versiones anteriores a la
 * regla dejaban en `campaigns.quotaExhaustedAt`.
 */
export type StoredQuotaCut =
  | string
  | { provider: string; reason: QuotaReason; at: string; until: string };

/** Lo que dura el corte por una ráfaga cuando el proveedor no dice cuánto esperar. */
const BURST_CUT_DEFAULT_MINUTES = 15;
/** Una espera más larga que esta no es de una ráfaga: el corte no la sigue más allá. */
const BURST_CUT_MAX_MINUTES = 60;

// El día del proveedor (ADR-121 regla 5, que enmienda ADR-115 regla 5 y ADR-116 regla 19).

/**
 * La zona por la que el proveedor cuenta su cupo del día. Resend lo cuenta por día calendario UTC, de
 * 00:00 a 24:00, y lo reinicia a la medianoche UTC: no es una ventana móvil de 24 horas (su
 * documentación de cuotas y límites, consultada el 2026-10-10). En Colombia ese día empieza a las
 * 7:00 p. m. Es el único sitio que la nombra: la cuenta de lo enviado hoy, el final del corte por el
 * cupo del día y la hora que muestran las pantallas salen de las dos funciones que siguen.
 */
const PROVIDER_DAY_ZONE = "UTC";

/** Cuándo empezó el día del proveedor en que cae ese instante: desde ahí cuenta su cupo del día. */
export function providerDayStart(at: Date): Date {
  return startOfTodayIn(PROVIDER_DAY_ZONE, at);
}

/** Cuándo empieza el día siguiente del proveedor: ahí su cupo del día vuelve a empezar. */
export function providerDayEnd(at: Date): Date {
  return startOfNextDayIn(PROVIDER_DAY_ZONE, at);
}

/** La medianoche del primer día del mes que le sigue a ese instante en la zona dada. */
function startOfNextMonthIn(timeZone: string, at: Date): Date {
  const [year = 0, month = 1] = dateKeyIn(timeZone, at).split("-").map(Number);
  const first =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return atHourIn(timeZone, first, 0);
}

/**
 * Hasta cuándo ningún lote le pide nada al proveedor después de un rechazo por cuota. Una ráfaga corta
 * lo que el proveedor pidió esperar, en minutos enteros y entre uno y sesenta, o quince si no lo dijo;
 * el cupo del mes, hasta el primer día del mes siguiente de la zona dada; el del día, hasta que el
 * proveedor empieza su día siguiente, que no es el de esa zona (ADR-121 regla 5). Una causa que no se
 * reconoce corta como el cupo del día, que era lo que hacía todo rechazo. Una espera que no es un
 * número vale como no dicha: de ella no sale una fecha, y sin fecha no hay corte.
 */
export function quotaCutUntil(
  reason: QuotaReason,
  at: Date,
  timeZone: string,
  retryAfterMs: number | null,
): Date {
  if (reason === "BURST") {
    const requested =
      typeof retryAfterMs === "number" && !Number.isNaN(retryAfterMs) ? retryAfterMs : null;
    const minutes =
      requested === null
        ? BURST_CUT_DEFAULT_MINUTES
        : Math.min(BURST_CUT_MAX_MINUTES, Math.max(1, Math.ceil(requested / 60_000)));
    return new Date(at.getTime() + minutes * 60_000);
  }
  return reason === "MONTHLY" ? startOfNextMonthIn(timeZone, at) : providerDayEnd(at);
}

/** El corte que deja el rechazo que recibió el lote de las `at`. */
export function quotaCutFor(
  rejection: { provider: string; reason: QuotaReason; retryAfterMs: number | null },
  at: Date,
  timeZone: string,
): QuotaCut {
  const reason: QuotaReason =
    rejection.reason === "BURST" || rejection.reason === "MONTHLY" ? rejection.reason : "DAILY";
  return {
    provider: rejection.provider,
    reason,
    at,
    until: quotaCutUntil(reason, at, timeZone, rejection.retryAfterMs),
  };
}

/** El único proveedor que dejó cortes antes de que llevaran su nombre. */
const LEGACY_CUT_PROVIDER = "resend";

/** El corte guardado. La fecha sola de antes se lee como un corte de Resend por el cupo del día. */
export function readQuotaCut(stored: StoredQuotaCut | null, timeZone: string): QuotaCut | null {
  if (stored === null) {
    return null;
  }
  if (typeof stored === "string") {
    return quotaCutFor(
      { provider: LEGACY_CUT_PROVIDER, reason: "DAILY", retryAfterMs: null },
      new Date(stored),
      timeZone,
    );
  }
  return {
    provider: stored.provider,
    reason: stored.reason,
    at: new Date(stored.at),
    until: new Date(stored.until),
  };
}

/** Como queda guardado un corte. */
export function storeQuotaCut(cut: QuotaCut): Exclude<StoredQuotaCut, string> {
  return {
    provider: cut.provider,
    reason: cut.reason,
    at: cut.at.toISOString(),
    until: cut.until.toISOString(),
  };
}

/**
 * El corte, si a esa hora detiene los lotes que salen por ese proveedor: el de otro proveedor no lo
 * detiene, y el que ya llegó a su hora tampoco.
 */
export function quotaCutInEffect(
  cut: QuotaCut | null,
  provider: string,
  now: Date,
): QuotaCut | null {
  return cut !== null && cut.provider === provider && now.getTime() < cut.until.getTime()
    ? cut
    : null;
}

/**
 * Si un rechazo nuevo reemplaza al corte guardado. Un corte no se acorta: del mismo proveedor solo lo
 * reemplaza el que termina después, así que ni el rechazo tardío de un lote de ayer ni la ráfaga de uno
 * que venía en vuelo levantan el corte más largo que otro dejó.
 */
export function quotaCutReplaces(stored: QuotaCut | null, next: QuotaCut): boolean {
  return (
    stored === null ||
    stored.provider !== next.provider ||
    stored.until.getTime() < next.until.getTime()
  );
}

/**
 * El corte guardado que rige entre el de la clave de hoy y el que dejó una versión anterior en la suya.
 * El de antes solo cuenta si es más reciente: lo escribió una versión anterior después del último de
 * hoy. Con la misma hora rige el de hoy, que es como queda levantado un corte de antes.
 */
export function latestQuotaCut(stored: QuotaCut | null, legacy: QuotaCut | null): QuotaCut | null {
  if (legacy !== null && (stored === null || stored.at.getTime() < legacy.at.getTime())) {
    return legacy;
  }
  return stored;
}

/** Lo que queda donde un texto traía una dirección de correo. */
export const ADDRESS_MARK = "[correo]";

/**
 * Un texto ajeno sin las direcciones de correo que traiga (ADR-114 regla 5). Es para el error de un
 * proveedor, que puede nombrar al destinatario: lo que se registra y lo que se guarda en
 * `message.error` pasa primero por acá. Se va entero todo tramo sin espacios que tenga una arroba,
 * escrita o codificada (`%40`): quita de más antes que dejar media dirección.
 */
export function withoutAddresses(text: string): string {
  return text.replace(/\S*(?:@|%40)\S*/gi, ADDRESS_MARK);
}

// Bus de notificaciones (ADR-038 regla 2): un evento, destinatarios, textos y clave de deduplicación.

// El contrato del pedido vive en la capa neutral de eventos (ADR-084): lo emiten otros módulos.
export {
  NOTIFICATION_MAX_RECIPIENTS,
  type NotificationKind,
  type NotificationRequested,
  notificationRequestedSchema,
} from "@/domain-events/comms";

export interface PreferenceFlags {
  emailCampaigns: boolean;
  pushAnnouncements: boolean;
  pushPoints: boolean;
  pushReminders: boolean;
  pushWordle: boolean;
}

export const DEFAULT_PREFERENCES: PreferenceFlags = {
  emailCampaigns: true,
  pushAnnouncements: true,
  pushPoints: true,
  pushReminders: true,
  pushWordle: true,
};

/** Qué preferencia gobierna cada tipo de push; lo transaccional llega siempre. */
export function shouldDeliver(kind: NotificationKind, preferences: PreferenceFlags): boolean {
  switch (kind) {
    case "ANNOUNCEMENT":
      return preferences.pushAnnouncements;
    case "POINTS":
      return preferences.pushPoints;
    case "REMINDER":
    case "SURVEY":
      return preferences.pushReminders;
    // El único push diario se apaga solo (ADR-074 regla 4).
    case "WORDLE":
      return preferences.pushWordle;
    case "TRANSACTIONAL":
      return true;
  }
}

/**
 * Si un aviso ya venció (ADR-122 regla 9): desde su instante, incluido. Uno sin vencimiento no vence
 * nunca. Falla cerrado: un vencimiento que no se lee como instante cuenta como vencido, aunque el
 * contrato ya no lo deja llegar hasta acá.
 */
export function notificationExpired(expiresAt: string | undefined, now: Date): boolean {
  if (expiresAt === undefined) {
    return false;
  }
  // Negada y no con `<=`: una fecha ilegible da NaN, y con NaN toda comparación es falsa.
  return !(Date.parse(expiresAt) > now.getTime());
}

/** "Título · cuerpo" del inventario de push (14-copy §6): la primera parte es el título. */
export function splitPush(text: string): { title: string; body: string } {
  return splitTitleBody(text);
}
