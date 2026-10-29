import { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { submissionReceived } from "@/domain-events/forms";
import { inventoryIncidentReferred } from "@/domain-events/inventory";
import { checkinApproved, termSuccessorMissing } from "@/domain-events/participation";
import {
  committeeRemovalRequested,
  membershipChanged,
  personAnonymized,
  personDeletionRequested,
} from "@/domain-events/people";
import { evaluationRecorded, groupAdmissionFailed } from "@/domain-events/permanence";
import { onEvent, registerHandler } from "@/jobs/registry";
import { BOOSTER_KINDS } from "@/modules/participation";
import {
  APPOINTMENT_KINDS,
  CONSENT_PURPOSES,
  getPeopleByIds,
  getPersonRecord,
  listAllCommittees,
  listCommitteeRoles,
  listExpiredLeaves,
  purgeIfMembershipEnded,
  SANCTION_KINDS,
} from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { atHourIn, bogotaHourToUtc, formatDate, todayKey } from "@/shared/lib/dates";
import { CALL_ENTRY_STATUSES } from "./domain/calls-pure";
import { createCardFromSubmission } from "./domain/cards";
import { openTaskForReasonAs } from "./domain/commands";
import { deleteNotesFor, recordAutomaticInteraction } from "./domain/interactions";
import { recordOnboardingEvidence } from "./domain/onboarding";
import { REQUEST_STATUSES } from "./domain/requests-pure";
import { deleteTasksFor } from "./domain/tasks";
import {
  entryFor,
  TIMELINE_RULES,
  type TimelineLabels,
  type TimelineRule,
} from "./domain/timeline-pure";

// La línea de tiempo se alimenta sola (01-arquitectura.md): cada evento de dominio produce una
// interacción, idempotente por la fila del outbox. Salir o anonimizarse borra tareas y notas (ADR-030).

const STATUS_CODES = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"] as const;
const STAGE_CODES = ["PROSPECT", "APPLICANT", "MEMBER", "ALUMNI"] as const;
const PERMISSION_CODES = ["ADMIN", "COMMITTEE_LEADER", "BOARD"] as const;
const DECISION_KINDS = ["CONTINUES", "PROBATION", "EXIT_COMMITTEE", "EXIT_OE"] as const;

// Los campos de un evento de persona. T-427 trae once piezas (también da las columnas de Personas) y
// los campos son ocho: no es un par uno a uno y no entra a `tLabels` (ADR-126 regla 2). Cada campo
// lee su posición escrita, que la tupla de `tList` cuida: con una pieza de menos no compila. Sin
// prototipo, como el `Record` de `tLabels`: un campo que no está acá cae al respaldo de `label`.
function fieldLabels(): Readonly<Record<string, string>> {
  const [firstName, lastName, email, preferredName, phone, personalEmail, program, kind] =
    tList("T-427");
  return Object.assign(Object.create(null), {
    firstName,
    lastName,
    email,
    preferredName,
    phone,
    personalEmail,
    program,
    kind,
    cardUid: t("T-4100"),
  });
}

function labels(): TimelineLabels {
  return {
    texts: tList("T-458"),
    participationTexts: tList("T-667"),
    partialAttendanceText: t("T-3595"),
    boosterNames: tLabels("T-2451", BOOSTER_KINDS),
    permanenceTexts: tList("T-832"),
    crmTexts: tList("T-1046"),
    directionTexts: tList("T-2171"),
    sanctionTexts: tList("T-2234"),
    sanctionKinds: tLabels("T-2229", SANCTION_KINDS),
    stages: tLabels("T-1047", STAGE_CODES),
    requestStatuses: tLabels("T-876", REQUEST_STATUSES),
    callEntryStatuses: tLabels("T-899", CALL_ENTRY_STATUSES),
    decisions: tLabels("T-802", DECISION_KINDS),
    statuses: tLabels("T-381", STATUS_CODES),
    appointmentKinds: tLabels("T-444", APPOINTMENT_KINDS),
    permissions: tLabels("T-289", PERMISSION_CODES),
    purposes: tLabels("T-516", CONSENT_PURPOSES),
    fields: fieldLabels(),
  };
}

async function timeline(rule: TimelineRule, payload: unknown, ctx: { id: string }) {
  const [terms, committees, roles] = await Promise.all([
    listAllTerms(),
    listAllCommittees(),
    listCommitteeRoles(),
  ]);
  const termById = new Map(terms.map((item) => [item.id, item.code]));
  const committeeById = new Map(committees.map((item) => [item.id, item.name]));
  const roleByCode = new Map(roles.map((item) => [item.code, item.label]));
  const entry = entryFor(rule, payload, labels(), {
    termCode: (id) => termById.get(id) ?? "",
    committeeName: (id) => committeeById.get(id) ?? "",
    roleLabel: (code) => roleByCode.get(code) ?? code,
  });
  if (!entry) {
    return false;
  }
  return recordAutomaticInteraction(entry, { refType: "outbox", refId: ctx.id });
}

// Una regla por tipo de evento, cada una con su contrato: `onEvent` valida el payload antes de contarlo.
for (const rule of TIMELINE_RULES) {
  onEvent(rule.definition, async (payload, ctx) => {
    const written = await timeline(rule, payload, ctx);
    ctx.log.debug({ written }, "línea de tiempo");
  });
}

// Solo si la baja sigue vigente cuando corre el evento (ADR-118 regla 5): uno atrasado no se lleva
// las tareas de quien ya volvió.
onEvent(membershipChanged, async ({ personId, to }, ctx) => {
  if (to !== "INACTIVE") {
    return;
  }
  const tasks = await purgeIfMembershipEnded(personId, (command) =>
    deleteTasksFor(command.tx, personId),
  );
  if (tasks === null) {
    ctx.log.info({ personId }, "baja atrasada: la persona ya volvió y conserva sus tareas");
    return;
  }
  ctx.log.info({ personId, tasks }, "tareas borradas al salir");
});

onEvent(personAnonymized, async ({ personId }, ctx) => {
  const tasks = await deleteTasksFor(getDb(), personId);
  const notes = await deleteNotesFor(personId);
  ctx.log.info({ personId, tasks, notes }, "tareas y notas borradas por anonimización");
});

// Las tareas que abre el sistema pasan por `openTaskForReason` (ADR-115 regla 9): una sola abierta por
// motivo y sujeto, auditada a nombre del sistema. El handler solo dice el motivo, el título y el plazo.

// La solicitud de eliminación (ADR-030, ADR-034 regla 12): una tarea sin asignar que ven todos los
onEvent(inventoryIncidentReferred, async ({ incidentId, personId, actorId }, ctx) => {
  const opened = await openTaskForReasonAs(SYSTEM_ACTOR, {
    reason: { type: "INVENTORY_INCIDENT", incidentId, personId },
    title: t("T-4500"),
    assigneeId: null,
    due: null,
    requestedById: actorId,
  });
  ctx.log.info({ incidentId, ...opened }, "revisión de novedad de inventario");
});

// La solicitud de eliminación (ADR-030, ADR-034 regla 12): una tarea sin asignar que ven todos los
// ADMIN, con vencimiento a `privacy.deletionDays` días hábiles.
onEvent(personDeletionRequested, async ({ personId }, ctx) => {
  const people = await getPeopleByIds([personId]);
  const opened = await openTaskForReasonAs(SYSTEM_ACTOR, {
    reason: { type: "DELETION_REQUEST", personId },
    title: t("T-464", { nombre: people.get(personId)?.fullName?.trim() ?? "" }),
    assigneeId: null,
    due: { businessDays: "privacy.deletionDays" },
    requestedById: personId,
  });
  ctx.log.info({ personId, ...opened }, "tarea de eliminación");
});

// Pedido de retiro de un comité por su dirección (ADR-058): una tarea sin responsable para GH con el
// vencimiento de las solicitudes, una por persona y comité. La pertenencia no se toca: GH decide desde
// la Persona 360.
onEvent(committeeRemovalRequested, async (event, ctx) => {
  const [people, committees] = await Promise.all([
    getPeopleByIds([event.personId]),
    listAllCommittees(),
  ]);
  const opened = await openTaskForReasonAs(SYSTEM_ACTOR, {
    reason: {
      type: "COMMITTEE_REMOVAL",
      personId: event.personId,
      committeeId: event.committeeId,
    },
    title: t("T-2170", {
      nombre: people.get(event.personId)?.fullName?.trim() ?? "",
      comité: committees.find((item) => item.id === event.committeeId)?.name ?? "",
      motivo: event.reason || "—",
    }),
    assigneeId: null,
    due: { businessDays: "requests.taskDays" },
    requestedById: event.actorId,
  });
  ctx.log.info({ personId: event.personId, ...opened }, "tarea de retiro de comité");
});

// Una inscripción aceptada que no pudo entrar a su grupo (ADR-116 regla 7): una tarea sin responsable
// para GH con el vencimiento de las solicitudes, una por persona y convocatoria, con el motivo que dio
// permanence. La inscripción no se toca: GH decide qué hacer con ella.
onEvent(groupAdmissionFailed, async (event, ctx) => {
  const people = await getPeopleByIds([event.personId]);
  const opened = await openTaskForReasonAs(SYSTEM_ACTOR, {
    reason: { type: "GROUP_ADMISSION_FAILED", personId: event.personId, callId: event.callId },
    title: t("T-3217", {
      nombre: people.get(event.personId)?.fullName?.trim() ?? "",
      convocatoria: event.callTitle,
      motivo: event.reason,
    }),
    assigneeId: null,
    due: { businessDays: "requests.taskDays" },
    requestedById: event.actorId,
  });
  ctx.log.info(
    { personId: event.personId, callId: event.callId, ...opened },
    "tarea de inscripción que no entró al grupo",
  );
});

// La primera integración marca sola el paso del onboarding (ADR-031, ADR-034 regla 15). Las dos
// evidencias de este archivo las marca un trabajo del poller, que no tiene request: van sin IP (ADR-123
// regla 3).

// Una tarea de nuevos con buen desempeño marca el paso de decoración del onboarding (ADR-036).
onEvent(evaluationRecorded, async ({ personId, kind, evaluation }, ctx) => {
  if (kind !== "NEW_MEMBER_TASK" || evaluation !== "GOOD") {
    return;
  }
  const changed = await recordOnboardingEvidence(personId, "NEW_MEMBER_TASK", null);
  ctx.log.debug({ personId, changed }, "evidencia de la tarea de nuevos");
});

onEvent(checkinApproved, async ({ personId, category }, ctx) => {
  if (category !== "INTEGRATION") {
    return;
  }
  const changed = await recordOnboardingEvidence(personId, "FIRST_INTEGRATION", null);
  ctx.log.debug({ personId, changed }, "evidencia de la primera integración");
});

// Falta crear el término siguiente (ADR-004, ADR-035 regla 14): una tarea sin asignar que ven todos los
// ADMIN, una por término que falta, que vence el día en que termina el actual.
onEvent(termSuccessorMissing, async ({ next, endsOn }, ctx) => {
  const opened = await openTaskForReasonAs(SYSTEM_ACTOR, {
    reason: { type: "TERM_SUCCESSOR_MISSING", termCode: next },
    title: t("T-666", { codigo: next, fecha: endsOn }),
    assigneeId: null,
    due: { at: atHourIn("UTC", endsOn, 12) },
    requestedById: null,
  });
  ctx.log.info({ next, ...opened }, "tarea del término siguiente");
});

// Una respuesta con la acción "entrar al pipeline" crea su tarjeta (ADR-037 regla 7); idempotente por
// `card_submission_unique`, así que procesar dos veces el mismo evento no duplica.
onEvent(submissionReceived, async ({ submissionId, personId, actorId, actions }, ctx) => {
  if (!actions.pipelineId || !personId) {
    return;
  }
  const who = await getPersonRecord(personId);
  // Un trabajo no tiene request: actúa a nombre de quien envió la respuesta, sin IP.
  const result = await runCommand(actorId ? { personId: actorId, ip: null } : SYSTEM_ACTOR, (tx) =>
    createCardFromSubmission(tx, {
      pipelineId: actions.pipelineId ?? "",
      submissionId,
      personId,
      personStage: who?.stage ?? null,
    }),
  );
  ctx.log.info(
    { submissionId, cardId: result?.id ?? null, created: result?.created ?? false },
    "tarjeta desde la respuesta",
  );
});

// Licencia vencida sin regreso (Est. art. 11.3; ADR-060 regla 10): el programado diario abre una tarea
// a GH por persona, una sola vez mientras siga abierta; GH decide si vuelve, sigue o pierde la calidad.
registerHandler("membership.leave-check", async (_payload, ctx) => {
  const today = todayKey();
  const expired = await listExpiredLeaves(today);
  let opened = 0;
  for (const item of expired) {
    const result = await openTaskForReasonAs(SYSTEM_ACTOR, {
      reason: { type: "LEAVE_EXPIRED", personId: item.personId },
      title: t("T-2277", {
        nombre: item.fullName,
        fecha: formatDate(atHourIn("UTC", item.leaveUntil, 12)),
      }),
      assigneeId: null,
      due: { at: bogotaHourToUtc(today, 9) },
      requestedById: null,
    });
    opened += result.created ? 1 : 0;
  }
  ctx.log.info({ expired: expired.length, opened }, "licencias vencidas revisadas");
});
