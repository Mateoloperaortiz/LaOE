import { runCommand } from "@/db/tx";
import { listFormOptions } from "@/modules/forms";
import { listPermissions } from "@/modules/identity";
import { listAllTerms } from "@/modules/terms";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import {
  type CallInput,
  type CallListRow,
  callInputSchema,
  createCall,
  getCall,
  listCalls,
  setCallStatus,
  updateCall,
} from "./domain/calls";
import { CALL_SELECTIONS, CALL_STATUSES } from "./domain/calls-pure";
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

const [plural, singular] = tList("T-423");
const [titulo, responsable, vence, estado, persona, tipo] = tList("T-459");
const [abierta, hecha] = tList("T-460");
const [general, eliminacion, solicitud, retiroComite, licenciaVencida] = tList("T-461");
const [mias, sinAsignar, todas] = tList("T-463");

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
        { value: "COMMITTEE_REMOVAL", label: retiroComite },
        { value: "LEAVE_EXPIRED", label: licenciaVencida },
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
        row.kind === "REQUEST"
          ? { text: t("T-1013"), href: `/admin/solicitudes?tarea=${row.id}` }
          : row.kind === "COMMITTEE_REMOVAL" || row.kind === "LEAVE_EXPIRED"
            ? row.personId
              ? {
                  text: row.kind === "LEAVE_EXPIRED" ? licenciaVencida : retiroComite,
                  href: `/admin/personas/${row.personId}?pestana=membresia`,
                }
              : row.kind === "LEAVE_EXPIRED"
                ? licenciaVencida
                : retiroComite
            : row.kind === "DELETION_REQUEST"
              ? eliminacion
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
  create: (actor, input) => runCommand(actor, (ctx) => createTask(ctx, input)),
  rowActions: [{ key: "done", label: t("T-462"), applies: (row) => row.status === "OPEN" }],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "done") {
      await runCommand(actor, (ctx) => completeTask(ctx, id));
    }
  },
  // El CSV lleva el nombre de la persona y el del responsable, y el título puede traer el motivo.
  personalData: true,
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

const [orgSingular, orgPlural] = tList("T-947");
const [orgNombre, orgTipo, orgSitio, orgNotas, orgContactos, orgEtiquetas] = tList("T-948");
const orgKindLabels = tLabels("T-949", ORGANIZATION_KINDS);
const kindOptions = ORGANIZATION_KINDS.map((value) => ({
  value,
  label: orgKindLabels[value] ?? value,
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
      render: (row) => orgKindLabels[row.kind] ?? row.kind,
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
    {
      name: "notes",
      label: orgNotas ?? "",
      type: "textarea",
      textVariant: "code",
      rows: 8,
      help: t("T-337"),
    },
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
  create: (actor, input) => runCommand(actor, (ctx) => createOrganization(ctx, input)),
  update: (actor, id, input) => runCommand(actor, (ctx) => updateOrganization(ctx, id, input)),
  personalData: false,
  exportRow: (row) => ({
    nombre: row.name,
    tipo: row.kind,
    sitio_web: row.website,
    contactos: row.contactCount,
    etiquetas: row.tagNames.join("; "),
  }),
};

// Pipelines (ADR-037 regla 7): crear siembra la plantilla de su tipo; el kanban es a medida.

const [pipeSingular, pipePlural] = tList("T-962");
const [pipeNombre, pipeTipo, pipeArchivado, pipeAbiertas, pipeTablero] = tList("T-963");
const pipeKindLabels = tLabels("T-964", PIPELINE_KINDS);
const [archivar, desarchivar] = tList("T-969");
const [si, no] = tList("T-1058");
const pipeKindOptions = PIPELINE_KINDS.map((value) => ({
  value,
  label: pipeKindLabels[value] ?? value,
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
      render: (row) => pipeKindLabels[row.kind] ?? row.kind,
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
  create: (actor, input) => runCommand(actor, (ctx) => createPipeline(ctx, input)),
  update: (actor, id, input) => runCommand(actor, (ctx) => updatePipeline(ctx, id, input)),
  rowActions: [
    { key: "archive", label: archivar, applies: (row) => !row.isArchived },
    { key: "unarchive", label: desarchivar, applies: (row) => row.isArchived },
  ],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "archive" || actionKey === "unarchive") {
      await runCommand(actor, (ctx) => setPipelineArchived(ctx, id, actionKey === "archive"));
    }
  },
  personalData: false,
  exportRow: (row) => ({
    nombre: row.name,
    tipo: row.kind,
    archivado: row.isArchived ? si : no,
    tarjetas_abiertas: row.openCards,
  }),
};

// Convocatorias internas (ADR-037 regla 10): el kit lista, crea, edita, abre y cierra; el selector de
// grupos lo compone el registro de la app (crm no importa permanence); el detalle es a medida.

const [callSingular, callPlural] = tList("T-1016");
const [
  cTitulo,
  cGrupo,
  cFormulario,
  cAbre,
  cCierra,
  cCupo,
  cSeleccion,
  cEstado,
  cInscritos,
  cDescripcion,
] = tList("T-1017");
const selectionLabels = tLabels("T-1018", CALL_SELECTIONS);
const callStatusLabels = tLabels("T-1019", CALL_STATUSES);
const [cAbrir, cCerrar] = tList("T-1020");

function callStatusCell(status: CallListRow["status"]) {
  const label = callStatusLabels[status] ?? status;
  return status === "OPEN"
    ? { text: label, badge: "amarillo" as const }
    : status === "CLOSED"
      ? { text: label, badge: "paper" as const }
      : { text: label, badge: "sky" as const };
}

async function callFields(): Promise<FieldDefinition[]> {
  const [terms, forms] = await Promise.all([listAllTerms(), listFormOptions()]);
  return [
    {
      name: "termId",
      label: tList("T-262")[1] ?? "",
      type: "select",
      required: true,
      options: terms.map((term) => ({ value: term.id, label: term.code })),
    },
    // El grupo lo agrega el registro de la app con las opciones de permanence.
    { name: "title", label: cTitulo ?? "", type: "text", required: true },
    {
      name: "formId",
      label: cFormulario ?? "",
      type: "select",
      emptyOption: t("T-1021"),
      options: forms
        .filter((form) => form.audience === "MEMBERS")
        .map((form) => ({ value: form.id, label: form.label })),
    },
    {
      name: "description",
      label: cDescripcion ?? "",
      type: "textarea",
      textVariant: "code",
      rows: 6,
      help: t("T-337"),
    },
    { name: "opensAt", label: cAbre ?? "", type: "datetime", required: true },
    { name: "closesAt", label: cCierra ?? "", type: "datetime", required: true },
    { name: "capacity", label: cCupo ?? "", type: "number" },
    {
      name: "selection",
      label: cSeleccion ?? "",
      type: "select",
      required: true,
      options: CALL_SELECTIONS.map((value) => ({
        value,
        label: selectionLabels[value] ?? value,
      })),
    },
    {
      name: "status",
      label: cEstado ?? "",
      type: "select",
      required: true,
      options: CALL_STATUSES.map((value) => ({
        value,
        label: callStatusLabels[value] ?? value,
      })),
    },
  ];
}

export const callsResource: ResourceDefinition<CallListRow, CallInput> = {
  key: "convocatorias",
  names: { singular: callSingular, plural: callPlural },
  basePath: "/admin/convocatorias",
  columns: [
    {
      key: "title",
      label: cTitulo ?? "",
      render: (row) => ({ text: row.title, href: `/admin/convocatorias/${row.id}` }),
    },
    // La columna del grupo la agrega el registro de la app.
    { key: "form", label: cFormulario ?? "", render: (row) => row.formTitle },
    { key: "opensAt", label: cAbre ?? "", render: (row) => formatDateTime(row.opensAt) },
    { key: "closesAt", label: cCierra ?? "", render: (row) => formatDateTime(row.closesAt) },
    {
      key: "capacity",
      label: cCupo ?? "",
      render: (row) =>
        row.capacity === null ? null : t("T-1027", { aceptados: row.accepted, cupo: row.capacity }),
    },
    {
      key: "selection",
      label: cSeleccion ?? "",
      render: (row) => selectionLabels[row.selection] ?? row.selection,
    },
    { key: "status", label: cEstado ?? "", render: (row) => callStatusCell(row.status) },
    { key: "entries", label: cInscritos ?? "", render: (row) => row.entries },
  ],
  filters: [
    {
      key: "status",
      label: cEstado ?? "",
      options: CALL_STATUSES.map((value) => ({
        value,
        label: callStatusLabels[value] ?? value,
      })),
    },
    { key: "groupId", label: cGrupo ?? "", options: [] },
  ],
  schema: callInputSchema,
  fields: callFields,
  list: (params) =>
    listCalls({
      q: params.q,
      status: params.filters.status,
      groupId: params.filters.groupId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getCall,
  toFormValues: (row) => ({
    termId: row.termId,
    groupId: row.groupId,
    formId: row.formId ?? "",
    title: row.title,
    description: row.description,
    opensAt: utcToBogotaInput(row.opensAt),
    closesAt: utcToBogotaInput(row.closesAt),
    capacity: row.capacity === null ? "" : String(row.capacity),
    selection: row.selection,
    status: row.status,
  }),
  create: (actor, input) => runCommand(actor, (ctx) => createCall(ctx, input)),
  update: (actor, id, input) => runCommand(actor, (ctx) => updateCall(ctx, id, input)),
  rowActions: [
    { key: "open", label: cAbrir, applies: (row) => row.status !== "OPEN" },
    { key: "close", label: cCerrar, applies: (row) => row.status === "OPEN" },
  ],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "open" || actionKey === "close") {
      await runCommand(actor, (ctx) =>
        setCallStatus(ctx, id, actionKey === "open" ? "OPEN" : "CLOSED"),
      );
    }
  },
  personalData: false,
  exportRow: (row) => ({
    titulo: row.title,
    grupo: row.groupId,
    abre: row.opensAt.toISOString(),
    cierra: row.closesAt.toISOString(),
    cupo: row.capacity,
    seleccion: row.selection,
    estado: row.status,
    inscritos: row.entries,
    aceptados: row.accepted,
  }),
};
