import { z } from "zod";
import { runCommand } from "@/db/tx";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import {
  createForm,
  type FormInput,
  type FormListRow,
  formInputSchema,
  getForm,
  listForms,
  setFormStatus,
  updateForm,
} from "./domain/forms";
import { parseFields } from "./domain/pure";
import { getRegistration, listRegistrations, type RegistrationRow } from "./domain/registrations";
import { getSubmission, listSubmissions, type SubmissionListRow } from "./domain/submissions";

// Recursos del admin de formularios (ADR-017, ADR-037): el listado, crear, editar, abrir y cerrar van
// por el kit; los campos y las acciones se editan en el constructor a medida (/admin/formularios/[id]).

const emptySchema = z.object({});
type Empty = z.infer<typeof emptySchema>;

const [formsSingular, formsPlural] = tList("T-909");
const [
  identificador,
  titulo,
  descripcion,
  audiencia,
  estado,
  abre,
  cierra,
  tope,
  variasPorCorreo,
  consentimiento,
  gracias,
  respuestas,
] = tList("T-910");
const [publico, miembros] = tList("T-911");
const [borrador, abierto, cerrado] = tList("T-912");
const [abrir, cerrar] = tList("T-913");

const audienceOptions = [
  { value: "PUBLIC", label: publico },
  { value: "MEMBERS", label: miembros },
];
const statusOptions = [
  { value: "DRAFT", label: borrador },
  { value: "OPEN", label: abierto },
  { value: "CLOSED", label: cerrado },
];

function statusCell(status: FormListRow["status"]) {
  if (status === "OPEN") {
    return { text: abierto, badge: "amarillo" as const };
  }
  if (status === "CLOSED") {
    return { text: cerrado, badge: "paper" as const };
  }
  return { text: borrador, badge: "sky" as const };
}

const formFields: FieldDefinition[] = [
  {
    name: "slug",
    label: identificador ?? "",
    type: "text",
    required: true,
    placeholder: "admision-2026-2",
    help: t("T-916", { identificador: "…" }),
  },
  { name: "title", label: titulo ?? "", type: "text", required: true },
  {
    name: "description",
    label: descripcion ?? "",
    type: "textarea",
    textVariant: "code",
    rows: 8,
    help: t("T-337"),
  },
  {
    name: "audience",
    label: audiencia ?? "",
    type: "select",
    required: true,
    options: audienceOptions,
  },
  { name: "status", label: estado ?? "", type: "select", required: true, options: statusOptions },
  { name: "opensAt", label: abre ?? "", type: "datetime" },
  { name: "closesAt", label: cierra ?? "", type: "datetime" },
  { name: "maxSubmissions", label: tope ?? "", type: "number" },
  { name: "allowMultiple", label: variasPorCorreo ?? "", type: "checkbox" },
  { name: "consentRequired", label: consentimiento ?? "", type: "checkbox", help: t("T-934") },
  {
    name: "thanks",
    label: gracias ?? "",
    type: "textarea",
    textVariant: "code",
    rows: 4,
    help: t("T-337"),
  },
];

export const formsResource: ResourceDefinition<FormListRow, FormInput> = {
  key: "formularios",
  names: { singular: formsSingular, plural: formsPlural },
  basePath: "/admin/formularios",
  columns: [
    {
      key: "title",
      label: titulo ?? "",
      render: (row) => ({ text: row.title, href: `/admin/formularios/${row.id}` }),
    },
    { key: "slug", label: identificador ?? "", render: (row) => `/f/${row.slug}` },
    {
      key: "audience",
      label: audiencia ?? "",
      render: (row) => (row.audience === "PUBLIC" ? publico : miembros),
    },
    { key: "status", label: estado ?? "", render: (row) => statusCell(row.status) },
    {
      key: "closesAt",
      label: cierra ?? "",
      render: (row) => (row.closesAt ? formatDateTime(row.closesAt) : null),
    },
    {
      key: "submissions",
      label: respuestas ?? "",
      render: (row) => ({
        text: String(row.submissionCount),
        href: `/admin/formularios/${row.id}/respuestas`,
      }),
    },
  ],
  filters: [
    { key: "audience", label: audiencia ?? "", options: audienceOptions },
    { key: "status", label: estado ?? "", options: statusOptions },
  ],
  schema: formInputSchema,
  fields: formFields,
  list: (params) =>
    listForms({
      q: params.q,
      audience: params.filters.audience,
      status: params.filters.status,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getForm,
  toFormValues: (row) => ({
    slug: row.slug,
    title: row.title,
    description: row.description,
    audience: row.audience,
    status: row.status,
    opensAt: row.opensAt ? utcToBogotaInput(row.opensAt) : "",
    closesAt: row.closesAt ? utcToBogotaInput(row.closesAt) : "",
    maxSubmissions: row.maxSubmissions === null ? "" : String(row.maxSubmissions),
    allowMultiple: row.allowMultiple ? "on" : "",
    consentRequired: row.consentRequired ? "on" : "",
    thanks: row.thanks ?? "",
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createForm(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateForm(ctx, id, input)),
  rowActions: [
    { key: "open", label: abrir, applies: (row) => row.status !== "OPEN" },
    { key: "close", label: cerrar, applies: (row) => row.status === "OPEN" },
  ],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "open" || actionKey === "close") {
      await runCommand({ personId: actor.personId }, (ctx) =>
        setFormStatus(ctx, id, actionKey === "open" ? "OPEN" : "CLOSED"),
      );
    }
  },
  exportRow: (row) => ({
    identificador: row.slug,
    titulo: row.title,
    audiencia: row.audience,
    estado: row.status,
    abre: row.opensAt ? row.opensAt.toISOString() : null,
    cierra: row.closesAt ? row.closesAt.toISOString() : null,
    tope: row.maxSubmissions,
    respuestas: row.submissionCount,
    campos: parseFields(row.fields)
      .map((field) => field.key)
      .join(" "),
  }),
};

// Respuestas: solo lectura, anidadas bajo /admin/formularios/[id]/respuestas con el formulario fijado.

const [submissionSingular, submissionPlural] = tList("T-935");
const [fecha, nombre, correo, persona, , consentimientoCol, ip] = tList("T-936");
const [si, no] = tList("T-1058");

function answersCells(answers: Record<string, unknown>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (Array.isArray(value)) {
      out[key] = value.join("; ");
    } else if (typeof value === "boolean") {
      out[key] = value ? si : no;
    } else if (typeof value === "string" || typeof value === "number") {
      out[key] = value;
    } else {
      out[key] = null;
    }
  }
  return out;
}

export const submissionsResource: ResourceDefinition<SubmissionListRow, Empty> = {
  key: "respuestas",
  names: { singular: submissionSingular, plural: submissionPlural },
  basePath: "/admin/formularios",
  columns: [
    { key: "createdAt", label: fecha ?? "", render: (row) => formatDateTime(row.createdAt) },
    {
      key: "name",
      label: nombre ?? "",
      render: (row) => ({
        text:
          row.personName ?? (`${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email),
        href: `/admin/formularios/${row.formId}/respuestas?ver=${row.id}`,
      }),
    },
    { key: "email", label: correo ?? "", render: (row) => row.email },
    {
      key: "person",
      label: persona ?? "",
      render: (row) =>
        row.personId
          ? { text: row.personName ?? row.email, href: `/admin/personas/${row.personId}` }
          : null,
    },
    {
      key: "consent",
      label: consentimientoCol ?? "",
      render: (row) => (row.consentAcceptedAt ? si : no),
    },
    { key: "ip", label: ip ?? "", render: (row) => row.ip },
  ],
  filters: [{ key: "formId", label: formsSingular, options: [] }],
  schema: emptySchema,
  fields: [],
  list: (params) =>
    listSubmissions({
      formId: params.filters.formId,
      q: params.q,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getSubmission,
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    fecha: row.createdAt.toISOString(),
    nombre: row.firstName ?? row.personName ?? "",
    apellido: row.lastName ?? "",
    correo: row.email,
    consentimiento: row.consentAcceptedAt ? si : no,
    ip: row.ip,
    ...answersCells(row.answers),
  }),
};

// Inscritos de una edición: solo lectura, anidados bajo /admin/eventos/[id]/ediciones/[edicionId]/inscritos.

const [registrationSingular, registrationPlural] = tList("T-940");
const [regNombre, regCorreo, regEstado, inscritoEl] = tList("T-941");
const [inscrito, cancelada] = tList("T-942");

export const registrationsResource: ResourceDefinition<RegistrationRow, Empty> = {
  key: "inscritos",
  names: { singular: registrationSingular, plural: registrationPlural },
  basePath: "/admin/eventos",
  columns: [
    {
      key: "fullName",
      label: regNombre ?? "",
      render: (row) => ({ text: row.fullName, href: `/admin/personas/${row.personId}` }),
    },
    { key: "email", label: regCorreo ?? "", render: (row) => row.email },
    {
      key: "status",
      label: regEstado ?? "",
      render: (row) =>
        row.status === "REGISTERED"
          ? { text: inscrito, badge: "amarillo" as const }
          : { text: cancelada, badge: "paper" as const },
    },
    { key: "createdAt", label: inscritoEl ?? "", render: (row) => formatDateTime(row.createdAt) },
  ],
  filters: [{ key: "editionId", label: tList("T-333")[1] ?? "", options: [] }],
  schema: emptySchema,
  fields: [],
  list: (params) =>
    listRegistrations({
      editionId: params.filters.editionId ?? "",
      q: params.q,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getRegistration,
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    nombre: row.fullName.split(" ")[0] ?? row.fullName,
    apellido: row.fullName.split(" ").slice(1).join(" "),
    correo: row.email,
    estado: row.status,
    inscrito_el: row.createdAt.toISOString(),
  }),
};
