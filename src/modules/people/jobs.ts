import { boardCalendarPull, boardCalendarPush } from "@/domain-events/people";
import { onEvent, registerHandler } from "@/jobs/registry";
import { pullBoardCalendar, pushBoardEvent } from "./domain/board-calendar";
import { prunePhotosOfAnonymized } from "./domain/maintenance";

// Depuración diaria (ADR-012, prune): las fotos propias de quien ya fue anonimizado (ADR-116 regla 8).
// Si el bucket falla, el evento queda en espera y el poller lo reintenta.
registerHandler("people.prune", async (_payload, ctx) => {
  const photos = await prunePhotosOfAnonymized();
  ctx.log.info({ photos }, "depuración de personas");
});

// El calendario de la junta (ADR-197 regla 6): lo que nace en la casa se escribe en Google al instante;
// si Google falla, el outbox lo reintenta. Cada pocos minutos se lee lo que cambió allá.
onEvent(boardCalendarPush, async ({ eventId }) => {
  await pushBoardEvent(eventId);
});

onEvent(boardCalendarPull, async ({ at }, ctx) => {
  const parsed = at ? new Date(at) : ctx.now;
  const now = Number.isNaN(parsed.getTime()) ? ctx.now : parsed;
  const result = await pullBoardCalendar(now);
  if (result.read > 0) ctx.log.info(result, "calendario de la junta leído");
});
