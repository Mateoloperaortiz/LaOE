import { mediaProcess } from "@/domain-events/content";
import { onEvent } from "@/jobs/registry";
import { processMedia } from "./domain/media-process";

// Variantes de imagen por outbox (ADR-022): encoladas al confirmar una subida.
onEvent(mediaProcess, async ({ assetId }, ctx) => {
  const outcome = await processMedia(assetId);
  ctx.log.info({ assetId, outcome }, "medio procesado");
});
