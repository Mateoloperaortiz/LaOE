import { personAnonymized } from "@/domain-events/people";
import { onEvent, registerHandler } from "@/jobs/registry";
import { checkBackup, pruneOutbox } from "./domain/maintenance";
import { deleteSavedViewsOf } from "./domain/saved-views";

registerHandler("system.prune", async (_payload, ctx) => {
  const deleted = await pruneOutbox();
  ctx.log.info({ deleted }, "outbox depurado");
});

registerHandler("system.backup-check", async (_payload, ctx) => {
  const status = await checkBackup();
  if (status.ok) {
    ctx.log.info(status, "copia externa al día");
  } else {
    ctx.log.warn(status, "copia externa atrasada");
  }
});

// Al anonimizar a una persona se van sus vistas guardadas, también las compartidas (ADR-170 regla 1).
onEvent(personAnonymized, async ({ personId }, ctx) => {
  const deleted = await deleteSavedViewsOf(personId);
  ctx.log.info({ deleted }, "vistas guardadas borradas");
});
