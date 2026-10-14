import { mediaBackfill, mediaProcess } from "@/domain-events/content";
import { personAnonymized } from "@/domain-events/people";
import { onEvent } from "@/jobs/registry";
import { deletePhotosFor } from "./domain/media";
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

// Al anonimizar se borran las fotos propias de la persona con todos sus objetos (ADR-116 regla 8). El
// comando de people solo suelta la referencia: el bucket es red y se limpia aquí, donde un fallo deja
// el evento en espera y el poller lo reintenta.
onEvent(personAnonymized, async ({ personId }, ctx) => {
  const photos = await deletePhotosFor(personId);
  ctx.log.info({ personId, photos }, "fotos propias borradas al anonimizar");
});
