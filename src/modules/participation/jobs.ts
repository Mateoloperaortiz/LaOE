import { z } from "zod";
import { registerHandler } from "@/jobs/registry";
import { listTermCommitteeMembers } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { getOccasion } from "./domain/occasions";
import { recomputeOccasionScore } from "./domain/scores";

// Handlers del outbox de participación (ADR-012, ADR-035): el recompute del score corre fuera del
// request, una vez por ráfaga (clave por ocasión) y bajo advisory lock.

const scoreEvent = z.object({ occasionId: z.string().min(1) });

registerHandler("score.recompute", async (payload, ctx) => {
  const { occasionId } = scoreEvent.parse(payload);
  const row = await getOccasion(occasionId);
  if (!row) {
    ctx.log.warn({ occasionId }, "recompute de una ocasión que no existe");
    return;
  }
  const [roster, shrinkK] = await Promise.all([
    listTermCommitteeMembers(row.termId),
    requireConfig("score.shrinkK"),
  ]);
  const rows = await recomputeOccasionScore(occasionId, roster, shrinkK);
  ctx.log.info({ occasionId, rows }, "score de comité recalculado");
});
