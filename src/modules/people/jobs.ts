import { registerHandler } from "@/jobs/registry";
import { prunePhotosOfAnonymized } from "./domain/maintenance";

// Depuración diaria (ADR-012, prune): las fotos propias de quien ya fue anonimizado (ADR-116 regla 8).
// Si el bucket falla, el evento queda en espera y el poller lo reintenta.
registerHandler("people.prune", async (_payload, ctx) => {
  const photos = await prunePhotosOfAnonymized();
  ctx.log.info({ photos }, "depuración de personas");
});
