import { z } from "zod";
import { registerHandler } from "@/jobs/registry";
import { listAllTerms } from "@/modules/participation";
import {
  APPOINTMENT_KINDS,
  CONSENT_PURPOSES,
  listAllCommittees,
  listCommitteeRoles,
} from "@/modules/people";
import { tList } from "@/shared/copy";
import { deleteNotesFor, recordAutomaticInteraction } from "./domain/interactions";
import { deleteTasksFor } from "./domain/tasks";
import { summarizeEvent, TIMELINE_EVENTS, type TimelineLabels } from "./domain/timeline-pure";

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
