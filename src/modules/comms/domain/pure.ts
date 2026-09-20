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
