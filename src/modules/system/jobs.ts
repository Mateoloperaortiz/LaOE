import { registerHandler } from "@/jobs/registry";
import { checkBackup, pruneOutbox } from "./domain/maintenance";

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
