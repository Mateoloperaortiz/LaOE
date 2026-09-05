import { runCommand } from "@/db/tx";
import { listPermissions } from "@/modules/identity";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  ORGANIZATION_KINDS,
  type OrganizationInput,
  type OrganizationListRow,
  organizationInputSchema,
  updateOrganization,
} from "./domain/organizations";
import {
  createPipeline,
  getPipeline,
  listPipelines,
  type PipelineInput,
  type PipelineListRow,
  pipelineInputSchema,
  setPipelineArchived,
  updatePipeline,
} from "./domain/pipelines";
import { PIPELINE_KINDS } from "./domain/pipelines-pure";
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
const [general, eliminacion, solicitud] = tList("T-461") as [string, string, string];
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
        { value: "REQUEST", label: solicitud },
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
      key: "organization",
      label: tList("T-948")[0] ?? "",
      render: (row) =>
        row.organizationId && row.organizationName
          ? { text: row.organizationName, href: `/admin/organizaciones/${row.organizationId}` }
          : null,
    },
    {
      key: "kind",
      label: tipo,
      render: (row) =>
        row.kind === "DELETION_REQUEST"
          ? eliminacion
          : row.kind === "REQUEST"
            ? solicitud
            : general,
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
    organizacion: row.organizationName,
    tipo: row.kind,
  }),
};

// Organizaciones (ADR-037 regla 6): el kit lista, crea y edita; el detalle a medida lleva contactos,
// notas, tareas, etiquetas y tarjetas.

const [orgSingular, orgPlural] = tList("T-947") as [string, string];
const [orgNombre, orgTipo, orgSitio, orgNotas, orgContactos, orgEtiquetas] = tList("T-948");
const orgKindLabels = tList("T-949");
const kindOptions = ORGANIZATION_KINDS.map((value, index) => ({
  value,
  label: orgKindLabels[index] ?? value,
}));

export const organizationsResource: ResourceDefinition<OrganizationListRow, OrganizationInput> = {
  key: "organizaciones",
  names: { singular: orgSingular, plural: orgPlural },
  basePath: "/admin/organizaciones",
  columns: [
    {
      key: "name",
      label: orgNombre ?? "",
      render: (row) => ({ text: row.name, href: `/admin/organizaciones/${row.id}` }),
    },
    {
      key: "kind",
      label: orgTipo ?? "",
      render: (row) => orgKindLabels[ORGANIZATION_KINDS.indexOf(row.kind)] ?? row.kind,
    },
    {
      key: "website",
      label: orgSitio ?? "",
      render: (row) => (row.website ? { text: row.website, href: row.website } : null),
    },
    { key: "contacts", label: orgContactos ?? "", render: (row) => row.contactCount },
    { key: "tags", label: orgEtiquetas ?? "", render: (row) => row.tagNames.join(", ") || null },
  ],
  filters: [{ key: "kind", label: orgTipo ?? "", options: kindOptions }],
  schema: organizationInputSchema,
  fields: [
    { name: "name", label: orgNombre ?? "", type: "text", required: true },
    { name: "kind", label: orgTipo ?? "", type: "select", required: true, options: kindOptions },
    { name: "website", label: orgSitio ?? "", type: "url" },
    { name: "notes", label: orgNotas ?? "", type: "textarea", rows: 8, help: t("T-337") },
  ],
  list: (params) =>
    listOrganizations({
      q: params.q,
      kind: params.filters.kind,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getOrganization,
  toFormValues: (row) => ({
    name: row.name,
    kind: row.kind,
    website: row.website ?? "",
    notes: row.notes,
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createOrganization(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateOrganization(ctx, id, input)),
  exportRow: (row) => ({
    nombre: row.name,
    tipo: row.kind,
    sitio_web: row.website,
    contactos: row.contactCount,
    etiquetas: row.tagNames.join("; "),
  }),
};

// Pipelines (ADR-037 regla 7): crear siembra la plantilla de su tipo; el kanban es a medida.

const [pipeSingular, pipePlural] = tList("T-962") as [string, string];
const [pipeNombre, pipeTipo, pipeArchivado, pipeAbiertas, pipeTablero] = tList("T-963");
const pipeKindLabels = tList("T-964");
const [archivar, desarchivar] = tList("T-969") as [string, string];
const [si, no] = tList("T-1058") as [string, string];
const pipeKindOptions = PIPELINE_KINDS.map((value, index) => ({
  value,
  label: pipeKindLabels[index] ?? value,
}));

export const pipelinesResource: ResourceDefinition<PipelineListRow, PipelineInput> = {
  key: "pipelines",
  names: { singular: pipeSingular, plural: pipePlural },
  basePath: "/admin/pipelines",
  columns: [
    {
      key: "name",
      label: pipeNombre ?? "",
      render: (row) => ({ text: row.name, href: `/admin/pipelines/${row.id}` }),
    },
    {
      key: "kind",
      label: pipeTipo ?? "",
      render: (row) => pipeKindLabels[PIPELINE_KINDS.indexOf(row.kind)] ?? row.kind,
    },
    {
      key: "archived",
      label: pipeArchivado ?? "",
      render: (row) =>
        row.isArchived
          ? { text: si, badge: "paper" as const }
          : { text: no, badge: "sky" as const },
    },
    { key: "open", label: pipeAbiertas ?? "", render: (row) => row.openCards },
    {
      key: "board",
      label: pipeTablero ?? "",
      render: (row) => ({ text: t("T-968"), href: `/admin/pipelines/${row.id}` }),
    },
  ],
  filters: [
    { key: "kind", label: pipeTipo ?? "", options: pipeKindOptions },
    {
      key: "archived",
      label: pipeArchivado ?? "",
      options: [
        { value: "no", label: no },
        { value: "yes", label: si },
      ],
    },
  ],
  schema: pipelineInputSchema,
  fields: [
    { name: "name", label: pipeNombre ?? "", type: "text", required: true },
    {
      name: "kind",
      label: pipeTipo ?? "",
      type: "select",
      required: true,
      lockedOnEdit: true,
      options: pipeKindOptions,
    },
  ],
  list: (params) =>
    listPipelines({
      q: params.q,
      kind: params.filters.kind,
      archived: params.filters.archived,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getPipeline,
  toFormValues: (row) => ({ name: row.name, kind: row.kind }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createPipeline(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updatePipeline(ctx, id, input)),
  rowActions: [
    { key: "archive", label: archivar, applies: (row) => !row.isArchived },
    { key: "unarchive", label: desarchivar, applies: (row) => row.isArchived },
  ],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "archive" || actionKey === "unarchive") {
      await runCommand({ personId: actor.personId }, (ctx) =>
        setPipelineArchived(ctx, id, actionKey === "archive"),
      );
    }
  },
  exportRow: (row) => ({
    nombre: row.name,
    tipo: row.kind,
    archivado: row.isArchived ? si : no,
    tarjetas_abiertas: row.openCards,
  }),
};
