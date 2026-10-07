import { mediaBackfill, mediaProcess } from "@/domain-events/content";
import { onEvent } from "@/jobs/registry";
import { queueFullVariantBackfill } from "./domain/media-backfill";
import { processMedia } from "./domain/media-process";

// Variantes de imagen por outbox (ADR-022): encoladas al confirmar una subida.
onEvent(mediaProcess, async ({ assetId }, ctx) => {
  const outcome = await processMedia(assetId);
  ctx.log.info({ assetId, outcome }, "medio procesado");
});

// Relleno de la variante completa (ADR-114 regla 8): cada lote encola pocos `media.process` y, si
// quedan más, el lote siguiente.
onEvent(mediaBackfill, async ({ cursor }, ctx) => {
  const result = await queueFullVariantBackfill({ cursor, eventId: ctx.id });
  ctx.log.info({ cursor, ...result }, "relleno de medios: lote encolado");
});
