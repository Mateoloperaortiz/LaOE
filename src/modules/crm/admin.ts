import { runCommand } from "@/db/tx";
import { listPermissions } from "@/modules/identity";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import {
  completeTask,
  createTask,
  getTask,
  listTasks,
  type TaskInput,
  type TaskRow,
  taskInputSchema,
} from "./domain/tasks";

// Recurso "Tareas" del admin kit (ADR-017): las de la persona se crean desde la Persona 360.

const [plural, singular] = tList("T-423") as [string, string];
const [titulo, responsable, vence, estado, persona, tipo] = tList("T-459") as [
  string,
  string,
  string,
  string,
  string,
  string,
];
const [abierta, hecha] = tList("T-460") as [string, string];
const [general, eliminacion] = tList("T-461") as [string, string];
const [mias, sinAsignar, todas] = tList("T-463") as [string, string, string];

/** Las tareas se asignan a quien tiene permiso ADMIN. */
export async function assigneeOptions(): Promise<Array<{ value: string; label: string }>> {
  const { rows } = await listPermissions({ q: "", code: "ADMIN", page: 1, pageSize: 100 });
  return rows.map((row) => ({ value: row.personId, label: row.personName.trim() }));
}

async function fields(): Promise<FieldDefinition[]> {
  return [
    { name: "title", label: titulo, type: "text", required: true },
    { name: "assigneeId", label: responsable, type: "select", options: await assigneeOptions() },
    { name: "dueAt", label: vence, type: "datetime" },
    {
      name: "kind",
      label: tipo,
      type: "select",
      required: true,
      options: [
        { value: "GENERAL", label: general },
        { value: "DELETION_REQUEST", label: eliminacion },
      ],
    },
  ];
}

export const tasksResource: ResourceDefinition<TaskRow, TaskInput> = {
  key: "tareas",
  names: { plural, singular },
  basePath: "/admin/tareas",
  columns: [
    { key: "title", label: titulo, render: (row) => row.title },
    { key: "assignee", label: responsable, render: (row) => row.assigneeName ?? sinAsignar },
    { key: "dueAt", label: vence, render: (row) => (row.dueAt ? formatDateTime(row.dueAt) : null) },
    {
      key: "status",
      label: estado,
      render: (row) =>
        row.status === "OPEN"
          ? { text: abierta, badge: "amarillo" }
          : { text: hecha, badge: "paper" },
    },
    {
      key: "person",
      label: persona,
      render: (row) =>
        row.personId && row.personName
          ? { text: row.personName, href: `/admin/personas/${row.personId}` }
          : null,
    },
    {
      key: "kind",
      label: tipo,
      render: (row) => (row.kind === "DELETION_REQUEST" ? eliminacion : general),
    },
  ],
  filters: [
    {
      key: "status",
      label: estado,
      options: [
        { value: "OPEN", label: abierta },
        { value: "DONE", label: hecha },
      ],
    },
    {
      key: "assignee",
      label: responsable,
      options: [
        { value: "mine", label: mias },
        { value: "unassigned", label: sinAsignar },
        { value: "all", label: todas },
      ],
    },
  ],
  schema: taskInputSchema,
  fields,
  list: (params) =>
    listTasks({
      q: params.q,
      status: params.filters.status,
      assignee: params.filters.assignee,
      actorId: params.actor?.personId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getTask,
  toFormValues: (row) => ({
    title: row.title,
    assigneeId: row.assigneeId ?? "",
    dueAt: row.dueAt ? utcToBogotaInput(row.dueAt) : "",
    kind: row.kind,
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createTask(ctx, input)),
  rowActions: [{ key: "done", label: t("T-462"), applies: (row) => row.status === "OPEN" }],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "done") {
      await runCommand({ personId: actor.personId }, (ctx) => completeTask(ctx, id));
    }
  },
  exportRow: (row) => ({
    titulo: row.title,
    responsable: row.assigneeName,
    vence: row.dueAt ? row.dueAt.toISOString() : null,
    estado: row.status,
    persona: row.personName,
    tipo: row.kind,
  }),
};
