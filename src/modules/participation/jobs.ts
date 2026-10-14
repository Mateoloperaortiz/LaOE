import { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import {
  challengeCompleted,
  challengeRewardReversed,
  checkinApproved,
  checkinCancelled,
  checkinExcused,
  evidenceProcess,
  gamificationReconcile,
  occasionClosed,
  scoreRecompute,
  termSuccessorMissing,
  wordleCompleted,
} from "@/domain-events/participation";
import { membershipChanged, personAnonymized } from "@/domain-events/people";
import { type JobContext, onEvent, onEvents, registerHandler } from "@/jobs/registry";
import {
  listLiveCommitteeIds,
  listTermCommitteeMembers,
  purgeIfMembershipEnded,
} from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { findTermByCode, getCurrentTerm, nextTermCode } from "@/modules/terms";
import {
  awardSpecialBadgesForChallenge,
  awardSpecialBadgesForOccasion,
  clearFeaturedBadges,
  recomputeBadgesFor,
} from "./domain/badges";
import { clearExcuseReasonsFor } from "./domain/check-ins";
import { scrubStandingName } from "./domain/closing";
import { recomputeCommitteeAssembly } from "./domain/committee-assembly";
import { deleteEvidenceFor, processEvidenceFile } from "./domain/evidence";
import { isAutoCloseDue } from "./domain/occasion-pure";
import { closeOccasion, getOccasion, listOccasionsForTerm } from "./domain/occasions";
import { processReconciliationBatch } from "./domain/reconciliation";
import { runReminders } from "./domain/reminders";
import { recomputeOccasionScore } from "./domain/scores";
import { createSurveyInvites, deleteSurveyInvitesFor } from "./domain/surveys";
import { runWordleReminder } from "./domain/wordle-reminder";

// Handlers del outbox de participación (ADR-012, ADR-035): el recompute del score corre fuera del
// request, una vez por ráfaga (clave por ocasión) y bajo advisory lock.

onEvent(scoreRecompute, async ({ occasionId }, ctx) => {
  const row = await getOccasion(occasionId);
  if (!row) {
    ctx.log.warn({ occasionId }, "recompute de una ocasión que no existe");
    return;
  }
  const [roster, shrinkK, alive] = await Promise.all([
    listTermCommitteeMembers(row.termId),
    requireConfig("score.shrinkK"),
    listLiveCommitteeIds(),
  ]);
  // Un comité desactivado no compite, así que tampoco se le calculan filas nuevas (ADR-073 regla 4).
  const rows = await recomputeOccasionScore(
    occasionId,
    roster.filter((item) => alive.has(item.committeeId)),
    shrinkK,
  );
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
// fijarla. Si falta o no se lee vale la del poller (`ctx.now`, ADR-118 regla 2), no la del proceso.
registerHandler("participation.reminders", async (payload, ctx) => {
  const at = typeof payload.at === "string" ? new Date(payload.at) : ctx.now;
  const result = await runReminders(Number.isNaN(at.getTime()) ? ctx.now : at);
  if (result.due > 0) {
    ctx.log.info(result, "recordatorios encolados");
  }
});

// Aviso diario del Wordle (ADR-074): a las 9:00 de Bogotá, a quien todavía no abrió la partida del
// día. La hora del tick viaja en `at`, como en los recordatorios.
registerHandler("participation.wordle-reminder", async (payload, ctx) => {
  const at = typeof payload.at === "string" ? new Date(payload.at) : new Date();
  const result = await runWordleReminder(Number.isNaN(at.getTime()) ? new Date() : at);
  if (result.enqueued > 0) {
    ctx.log.info(result, "aviso del Wordle encolado");
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
    tx.emit(
      eventOf(
        termSuccessorMissing,
        { termId: term.id, code: term.code, next, endsOn: term.endsOn },
        { dedupeKey: `term-successor:${next}` },
      ),
    ),
  );
  ctx.log.info({ next, daysLeft }, "falta crear el término siguiente");
});

// Insignias (ADR-067 reglas 9, 10 y 15): cada hecho que sostiene una familia dispara el recompute
// de la persona — desbloqueo idempotente con su booster y revocación si el hecho desaparece — y el
// cierre de una ocasión o un reto completado otorgan las ediciones especiales vinculadas.
async function recomputeBadges(personId: string, event: string, ctx: JobContext): Promise<void> {
  const delta = await recomputeBadgesFor(personId, { historical: false });
  if (delta.unlocked.length > 0 || delta.revoked.length > 0) {
    ctx.log.info({ personId, event, ...delta }, "insignias recalculadas");
  }
}

onEvents(
  [checkinApproved, checkinCancelled, wordleCompleted, challengeCompleted, challengeRewardReversed],
  ({ personId }, ctx, type) => recomputeBadges(personId, type, ctx),
);

onEvent(challengeCompleted, async ({ challengeId, personId }, ctx) => {
  const awarded = await awardSpecialBadgesForChallenge(challengeId, personId);
  if (awarded > 0) {
    ctx.log.info({ challengeId, personId, awarded }, "ediciones especiales otorgadas por el reto");
  }
});

// Encuesta tras la ocasión (ADR-038 regla 13): al cerrar, una invitación por asistente aprobado y el
// push T-191 con la URL propia de cada uno.
onEvent(occasionClosed, async ({ occasionId }, ctx) => {
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
  const awarded = await awardSpecialBadgesForOccasion(occasionId);
  if (awarded > 0) {
    ctx.log.info({ occasionId, awarded }, "ediciones especiales otorgadas por la ocasión");
  }
});

// Un check-in decidido después de cerrar una asamblea cambia qué comités estuvieron representados.
onEvents([checkinApproved, checkinCancelled, checkinExcused], async ({ occasionId, kind }) => {
  if (kind === "ASSEMBLY") {
    await recomputeCommitteeAssembly(occasionId);
  }
});

// Al anonimizar, el nombre congelado en los standings pasa a T-223 (ADR-030): people no toca
// tablas de participation. Las invitaciones de encuesta tampoco son historia, y el motivo de una
// asistencia excusada es texto de la persona y puede decir de su salud (ADR-114 regla 4): se vacía
// antes de las evidencias, que dependen del bucket y pueden dejar el handler a medias.
onEvent(personAnonymized, async ({ personId }, ctx) => {
  const changed = await scrubStandingName(personId);
  const invites = await deleteSurveyInvitesFor(getDb(), personId);
  const featured = await clearFeaturedBadges(personId);
  const excuses = await clearExcuseReasonsFor(personId);
  const evidence = await deleteEvidenceFor(personId);
  ctx.log.info(
    { personId, changed, invites, featured, excuses, evidence },
    "participación anonimizada",
  );
});

// Solo si la baja sigue vigente cuando corre el evento (ADR-118 regla 5): uno atrasado no se lleva
// las invitaciones de quien ya volvió.
onEvent(membershipChanged, async ({ personId, to }, ctx) => {
  if (to !== "INACTIVE") {
    return;
  }
  const invites = await purgeIfMembershipEnded(personId, (command) =>
    deleteSurveyInvitesFor(command.tx, personId),
  );
  if (invites === null) {
    ctx.log.info({ personId }, "baja atrasada: la persona ya volvió y conserva sus invitaciones");
    return;
  }
  ctx.log.info({ personId, invites }, "invitaciones de encuesta borradas al salir");
});

// Evidencia de una misión (ADR-067 regla 6): re-encodea a WebP sin metadatos y marca READY; un
// objeto indecodificable queda FAILED sin reintento y un fallo del bucket reintenta con backoff.
onEvent(evidenceProcess, async ({ fileId }, ctx) => {
  const outcome = await processEvidenceFile(fileId);
  ctx.log.info({ fileId, outcome }, "evidencia procesada");
});

// Conciliación histórica (ADR-067 regla 13): cada evento procesa un lote del cursor y encadena el
// siguiente mientras queden personas; el batch del payload es informativo (la corrida lleva su
// cursor), así un evento duplicado o tardío no reprocesa nada.
onEvent(gamificationReconcile, async ({ runId, batch }, ctx) => {
  const result = await processReconciliationBatch(runId);
  ctx.log.info({ runId, batch, ...result }, "lote de conciliación procesado");
});
