import type { NotificationKind } from "@/domain-events/comms";
import { splitTitleBody } from "@/shared/copy/render";

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
  return Math.max(0, dailyLimit - (reserve ?? Math.ceil(dailyLimit / 3)));
}

/** Cuántos correos de campaña caben todavía hoy: lo que un lote reclamó y no ha enviado ya cuenta. */
export function campaignRoom(ceiling: number, sentToday: number, claimed: number): number {
  return Math.max(0, ceiling - sentToday - claimed);
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
  NOTIFICATION_KINDS,
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

/** "Título · cuerpo" del inventario de push (14-copy §6): la primera parte es el título. */
export function splitPush(text: string): { title: string; body: string } {
  return splitTitleBody(text);
}
