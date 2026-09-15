import { z } from "zod";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { registerHandler } from "@/jobs/registry";
import { listTermCommitteeMembers } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { findTermByCode, getCurrentTerm, nextTermCode } from "@/modules/terms";
import { scrubStandingName } from "./domain/closing";
import { recomputeCommitteeAssembly } from "./domain/committee-assembly";
import { processEvidenceFile } from "./domain/evidence";
import { isAutoCloseDue } from "./domain/occasion-pure";
import { closeOccasion, getOccasion, listOccasionsForTerm } from "./domain/occasions";
import { runReminders } from "./domain/reminders";
import { recomputeOccasionScore } from "./domain/scores";
import { createSurveyInvites, deleteSurveyInvitesFor } from "./domain/surveys";

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

// Recordatorios a personas (ADR-038 regla 9): actividades de hoy, reuniones y asambleas de mañana,
// asamblea en dos horas. La hora del tick viaja en `at` (el scheduler la pone); así una prueba puede
// fijarla.
registerHandler("participation.reminders", async (payload, ctx) => {
  const at = typeof payload.at === "string" ? new Date(payload.at) : new Date();
  const result = await runReminders(Number.isNaN(at.getTime()) ? new Date() : at);
  if (result.due > 0) {
    ctx.log.info(result, "recordatorios encolados");
  }
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

// Encuesta tras la ocasión (ADR-038 regla 13): al cerrar, una invitación por asistente aprobado y el
// push T-191 con la URL propia de cada uno.
const occasionClosed = z.object({ occasionId: z.string().min(1) });

registerHandler("occasion.closed", async (payload, ctx) => {
  const { occasionId } = occasionClosed.parse(payload);
  // Representación de los comités en una asamblea cerrada (ADR-060 regla 7).
  const represented = await recomputeCommitteeAssembly(occasionId);
  if (represented > 0) {
    ctx.log.info({ occasionId, represented }, "representación por comité calculada");
  }
  const result = await createSurveyInvites(occasionId);
  if (result.invited > 0) {
    ctx.log.info(
      { occasionId, invited: result.invited, created: result.created.length },
      "invitaciones de encuesta creadas",
    );
  }
});

// Un check-in decidido después de cerrar una asamblea cambia qué comités estuvieron representados.
const assemblyCheckIn = z.object({ occasionId: z.string().min(1), kind: z.string() });
for (const type of ["checkin.approved", "checkin.cancelled", "checkin.excused"]) {
  registerHandler(type, async (payload) => {
    const { occasionId, kind } = assemblyCheckIn.parse(payload);
    if (kind === "ASSEMBLY") {
      await recomputeCommitteeAssembly(occasionId);
    }
  });
}

// Al anonimizar, el nombre congelado en los standings pasa a T-223 (ADR-030): people no toca
// tablas de participation. Las invitaciones de encuesta tampoco son historia.
const personEvent = z.object({ personId: z.string().min(1) });

registerHandler("person.anonymized", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  const changed = await scrubStandingName(personId);
  const invites = await deleteSurveyInvitesFor(personId);
  ctx.log.info({ personId, changed, invites }, "standings anonimizados");
});

const membershipChanged = z.object({
  personId: z.string().min(1),
  to: z.enum(["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"]),
});

registerHandler("membership.changed", async (payload, ctx) => {
  const { personId, to } = membershipChanged.parse(payload);
  if (to !== "INACTIVE") {
    return;
  }
  const invites = await deleteSurveyInvitesFor(personId);
  ctx.log.info({ personId, invites }, "invitaciones de encuesta borradas al salir");
});

// Evidencia de una misión (ADR-067 regla 6): re-encodea a WebP sin metadatos y marca READY; un
// objeto indecodificable queda FAILED sin reintento y un fallo del bucket reintenta con backoff.
const evidenceFile = z.object({ fileId: z.string().min(1) });

registerHandler("gamification.evidence-process", async (payload, ctx) => {
  const { fileId } = evidenceFile.parse(payload);
  const outcome = await processEvidenceFile(fileId);
  ctx.log.info({ fileId, outcome }, "evidencia procesada");
});
