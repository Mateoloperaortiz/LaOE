import { registerHandler } from "@/jobs/registry";
import { processMedia } from "./domain/media-process";

// Variantes de imagen por outbox (ADR-022): encoladas al confirmar una subida.
registerHandler("media.process", async (payload, ctx) => {
  const assetId = typeof payload.assetId === "string" ? payload.assetId : "";
  if (!assetId) {
    throw new Error("media.process sin assetId");
  }
  const outcome = await processMedia(assetId);
  ctx.log.info({ assetId, outcome }, "medio procesado");
});
