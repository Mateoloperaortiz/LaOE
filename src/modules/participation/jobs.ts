import { z } from "zod";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { registerHandler } from "@/jobs/registry";
import { listTermCommitteeMembers } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { findTermByCode, getCurrentTerm, nextTermCode } from "@/modules/terms";
import { scrubStandingName } from "./domain/closing";
import { isAutoCloseDue } from "./domain/occasion-pure";
import { closeOccasion, getOccasion, listOccasionsForTerm } from "./domain/occasions";
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

// Cierre automático (ADR-035 regla 4): una ocasión abierta cuya ventana venció hace más de
// `occasions.autoCloseHours` se cierra sola y congela su denominador. Corre cada hora (`reminders`).
registerHandler("participation.auto-close", async (_payload, ctx) => {
  const [term, hours] = await Promise.all([
    getCurrentTerm(),
    requireConfig("occasions.autoCloseHours"),
  ]);
  if (!term) {
    return;
  }
  const now = new Date();
  const due = (await listOccasionsForTerm(term.id, ["OPEN"])).filter((row) =>
    isAutoCloseDue(row, now, hours),
  );
  for (const row of due) {
    await runCommand(SYSTEM_ACTOR, (tx) => closeOccasion(tx, row.id, now));
  }
  ctx.log.info({ closed: due.length }, "cierre automático de ocasiones");
});

// Recordatorio de términos (ADR-004): si el actual termina en 30 días o menos y no existe el
// siguiente, un evento con clave por código abre una tarea en crm.
const TERM_WARNING_DAYS = 30;

registerHandler("participation.term-check", async (_payload, ctx) => {
  const term = await getCurrentTerm();
  if (!term) {
    return;
  }
  const endsOn = new Date(`${term.endsOn}T23:59:59Z`);
  const daysLeft = Math.ceil((endsOn.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > TERM_WARNING_DAYS) {
    return;
  }
  const next = nextTermCode(term.code);
  if (await findTermByCode(next)) {
    return;
  }
  await runCommand(SYSTEM_ACTOR, (tx) =>
    tx.emit({
      type: "term.successor-missing",
      payload: { termId: term.id, code: term.code, next, endsOn: term.endsOn },
      dedupeKey: `term-successor:${next}`,
    }),
  );
  ctx.log.info({ next, daysLeft }, "falta crear el término siguiente");
});

// Al anonimizar, el nombre congelado en los standings pasa a T-223 (ADR-030): people no toca
// tablas de participation.
const personEvent = z.object({ personId: z.string().min(1) });

registerHandler("person.anonymized", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  const changed = await scrubStandingName(personId);
  ctx.log.info({ personId, changed }, "standings anonimizados");
});
