import { z } from "zod";

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

export const NOTIFICATION_KINDS = [
  "ANNOUNCEMENT",
  "POINTS",
  "REMINDER",
  "SURVEY",
  "TRANSACTIONAL",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_MAX_RECIPIENTS = 1000;

export const notificationRequestedSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  recipients: z
    .array(
      z.object({
        personId: z.string().min(1),
        url: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(NOTIFICATION_MAX_RECIPIENTS),
  title: z.string().min(1),
  body: z.string().default(""),
  url: z.string().min(1),
  tag: z.string().min(1).optional(),
  dedupeKey: z.string().min(1).max(200),
});

export type NotificationRequested = z.infer<typeof notificationRequestedSchema>;

export interface PreferenceFlags {
  emailCampaigns: boolean;
  pushAnnouncements: boolean;
  pushPoints: boolean;
  pushReminders: boolean;
}

export const DEFAULT_PREFERENCES: PreferenceFlags = {
  emailCampaigns: true,
  pushAnnouncements: true,
  pushPoints: true,
  pushReminders: true,
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
    case "TRANSACTIONAL":
      return true;
  }
}

/** "Título · cuerpo" del inventario de push (14-copy §6): la primera parte es el título. */
export function splitPush(text: string): { title: string; body: string } {
  const [title = "", ...rest] = text.split(" · ");
  return { title: title.trim(), body: rest.join(" · ").trim() };
}
