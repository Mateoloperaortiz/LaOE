import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { registerHandler } from "@/jobs/registry";
import {
  APPOINTMENT_KINDS,
  CONSENT_PURPOSES,
  getPeopleByIds,
  listAllCommittees,
  listCommitteeRoles,
} from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { listAllTerms } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { addBusinessDays } from "@/shared/lib/dates";
import { deleteNotesFor, recordAutomaticInteraction } from "./domain/interactions";
import { deleteTasksFor } from "./domain/tasks";
import { summarizeEvent, TIMELINE_EVENTS, type TimelineLabels } from "./domain/timeline-pure";
import { task } from "./schema";

// La línea de tiempo se alimenta sola (01-arquitectura.md): cada evento de dominio produce una
// interacción, idempotente por la fila del outbox. Salir o anonimizarse borra tareas y notas (ADR-030).

const STATUS_CODES = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"] as const;
const PERMISSION_CODES = ["ADMIN", "COMMITTEE_LEADER", "BOARD"] as const;
const FIELD_KEYS = [
  "firstName",
  "lastName",
  "email",
  "preferredName",
  "phone",
  "personalEmail",
  "program",
  "kind",
] as const;

function zip(keys: readonly string[], values: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? key]));
}

function labels(): TimelineLabels {
  return {
    texts: tList("T-458"),
    statuses: zip(STATUS_CODES, tList("T-381")),
    appointmentKinds: zip(APPOINTMENT_KINDS, tList("T-444")),
    permissions: zip(PERMISSION_CODES, tList("T-289")),
    purposes: zip(CONSENT_PURPOSES, tList("T-516")),
    fields: zip(FIELD_KEYS, tList("T-427")),
  };
}

async function timeline(payload: Record<string, unknown>, ctx: { id: string }, type: string) {
  const [terms, committees, roles] = await Promise.all([
    listAllTerms(),
    listAllCommittees(),
    listCommitteeRoles(),
  ]);
  const termById = new Map(terms.map((item) => [item.id, item.code]));
  const committeeById = new Map(committees.map((item) => [item.id, item.name]));
  const roleByCode = new Map(roles.map((item) => [item.code, item.label]));
  const entry = summarizeEvent(type, payload, labels(), {
    termCode: (id) => termById.get(id) ?? "",
    committeeName: (id) => committeeById.get(id) ?? "",
    roleLabel: (code) => roleByCode.get(code) ?? code,
  });
  if (!entry) {
    return false;
  }
  return recordAutomaticInteraction(entry, { refType: "outbox", refId: ctx.id });
}

for (const type of TIMELINE_EVENTS) {
  registerHandler(type, async (payload, ctx) => {
    const written = await timeline(payload, ctx, type);
    ctx.log.debug({ written }, "línea de tiempo");
  });
}

const personEvent = z.object({ personId: z.string().min(1) });
const membershipChanged = personEvent.extend({ to: z.string() });

registerHandler("membership.changed", async (payload, ctx) => {
  const { personId, to } = membershipChanged.parse(payload);
  if (to === "INACTIVE") {
    const tasks = await deleteTasksFor(personId);
    ctx.log.info({ personId, tasks }, "tareas borradas al salir");
  }
});

registerHandler("person.anonymized", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  const tasks = await deleteTasksFor(personId);
  const notes = await deleteNotesFor(personId);
  ctx.log.info({ personId, tasks, notes }, "tareas y notas borradas por anonimización");
});

// La solicitud de eliminación (ADR-030, ADR-034 regla 12) abre una tarea sin asignar que ven todos
// los ADMIN, con vencimiento a `privacy.deletionDays` días hábiles; no se duplica mientras siga abierta.
registerHandler("person.deletion-requested", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  const [open] = await getDb()
    .select({ id: task.id })
    .from(task)
    .where(
      and(eq(task.personId, personId), eq(task.kind, "DELETION_REQUEST"), eq(task.status, "OPEN")),
    )
    .limit(1);
  if (open) {
    ctx.log.debug({ personId, taskId: open.id }, "la solicitud de eliminación ya tiene tarea");
    return;
  }
  const [people, days] = await Promise.all([
    getPeopleByIds([personId]),
    requireConfig("privacy.deletionDays"),
  ]);
  const [created] = await getDb()
    .insert(task)
    .values({
      title: t("T-464", { nombre: people.get(personId)?.fullName?.trim() ?? "" }),
      kind: "DELETION_REQUEST",
      personId,
      createdById: personId,
      dueAt: addBusinessDays(new Date(), days),
    })
    .returning({ id: task.id });
  ctx.log.info({ personId, taskId: created?.id }, "tarea de eliminación creada");
});
