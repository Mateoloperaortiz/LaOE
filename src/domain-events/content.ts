import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `content`.

const id = z.string().min(1);

/** Un anuncio publicado con push: lleva lo que el aviso muestra, para que comms no consulte a content. */
export const announcementPushRequested = defineEvent(
  "announcement.push-requested",
  z.object({
    announcementId: id,
    title: z.string().min(1),
    excerpt: z.string(),
    audience: z.string(),
    /** Con comité, el aviso va a sus miembros; sin él, a activos y honorarios. */
    committeeId: id.nullable(),
    url: z.string().min(1),
    actorId: z.string().nullable(),
  }),
);

/**
 * Trabajo interno: genera las variantes de una imagen recién subida (ADR-022) o le escribe la completa
 * a una que quedó lista antes de ADR-114 regla 8.
 */
export const mediaProcess = defineEvent("media.process", z.object({ assetId: id }));

/**
 * Trabajo interno: un lote del relleno de la variante completa (ADR-114 regla 8), encadenado con cursor.
 * También es el programado de cada hora, que llega sin cursor: el payload del scheduler (`scheduled`,
 * `at`) no está en el contrato y se descarta al validar.
 */
export const mediaBackfill = defineEvent("media.backfill", z.object({ cursor: id.optional() }));
