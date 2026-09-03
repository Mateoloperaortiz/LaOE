import { registerHandler } from "@/jobs/registry";
import { pruneIdentity } from "./domain/maintenance";

registerHandler("identity.prune", async (_payload, ctx) => {
  const result = await pruneIdentity();
  ctx.log.info(result, "identity depurado");
});
