import { z } from "zod";
import { defineEvent } from "./define";

// Pedidos que atiende `comms`. No son hechos de un productor sino encargos: cualquier módulo pide una
// notificación y comms la entrega (ADR-038 regla 2). Por eso el contrato vive con quien lo atiende y no
// con quien lo emite, y por eso `kind` sí es un enumerado: el vocabulario lo fija comms, y un tipo que
// comms no conoce es un error de quien pide, no un valor nuevo que haya que dejar pasar.

export const NOTIFICATION_KINDS = [
  "ANNOUNCEMENT",
  "POINTS",
  "REMINDER",
  "SURVEY",
  "TRANSACTIONAL",
  "WORDLE",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Tope de destinatarios por pedido; quien tenga más los parte en varios pedidos. */
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
  /** Clave de entrega: una persona no recibe dos veces la misma. No es la del outbox. */
  dedupeKey: z.string().min(1).max(200),
});

export type NotificationRequested = z.infer<typeof notificationRequestedSchema>;

export const notificationRequested = defineEvent(
  "notification.requested",
  notificationRequestedSchema,
);

// Trabajo interno de `comms`.

/** «Enviar ahora»: corre el tick de campañas sin esperar al programado de cada minuto. */
export const campaignStart = defineEvent(
  "campaign.start",
  z.object({ campaignId: z.string().min(1), actorId: z.string().nullable() }),
);
