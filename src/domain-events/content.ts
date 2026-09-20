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

/** Trabajo interno: genera las variantes de una imagen recién subida (ADR-022). */
export const mediaProcess = defineEvent("media.process", z.object({ assetId: id }));
