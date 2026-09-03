import { readdirSync } from "node:fs";
import { runCommand } from "@/db/tx";
import type { Badge, FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import type { CommitteeRoleRow } from "./domain/committee-memberships";
import {
  type CommitteeInput,
  type CommitteeRow,
  committeeInputSchema,
  createCommittee,
  getCommittee,
  listAllCommittees,
  listCommittees,
  updateCommittee,
} from "./domain/committees";
import {
  createPerson,
  listPeople,
  type PersonInput,
  type PersonRow,
  personInputSchema,
} from "./domain/persons";
import {
  type CommitteeRoleInput,
  committeeRoleInputSchema,
  createCommitteeRole,
  getRole,
  listRoles,
  updateCommitteeRole,
} from "./domain/roles";

// Recursos del admin kit (ADR-017): Comités, Personas (el listado; la ficha es la Persona 360) y Cargos.

const [plural, singular] = tList("T-261") as [string, string];
const [activo, inactivo] = tList("T-287") as [string, string];
const [borrador, publicado] = tList("T-288") as [string, string];

function logoOptions(): Array<{ value: string; label: string }> {
  try {
    return readdirSync("public/logos/committees")
      .filter((file) => file.endsWith(".svg"))
      .map((file) => file.replace(/\.svg$/, ""))
      .sort()
      .map((key) => ({ value: key, label: key }));
  } catch {
    return [];
  }
}

const fields: FieldDefinition[] = [
  {
    name: "slug",
    label: t("T-272"),
    type: "text",
    required: true,
    lockedOnEdit: true,
    placeholder: "pixel",
  },
  { name: "name", label: t("T-273"), type: "text", required: true },
  {
    name: "status",
    label: t("T-274"),
    type: "select",
    required: true,
    options: [
      { value: "ACTIVE", label: activo },
      { value: "INACTIVE", label: inactivo },
    ],
  },
  { name: "color", label: t("T-275"), type: "color" },
  { name: "logoKey", label: t("T-276"), type: "select", options: logoOptions() },
  { name: "presentation", label: t("T-277"), type: "textarea" },
  { name: "contactUrl", label: t("T-278"), type: "url" },
  {
    name: "publicationStatus",
    label: t("T-279"),
    type: "select",
    required: true,
    options: [
      { value: "DRAFT", label: borrador },
      { value: "PUBLISHED", label: publicado },
    ],
  },
];

export const committeesResource: ResourceDefinition<CommitteeRow, CommitteeInput> = {
  key: "comites",
  names: { plural, singular },
  basePath: "/admin/comites",
  columns: [
    { key: "name", label: t("T-273"), render: (row) => row.name },
    { key: "slug", label: t("T-272"), render: (row) => row.slug },
    {
      key: "status",
      label: t("T-274"),
      render: (row) =>
        row.status === "ACTIVE"
          ? { text: activo, badge: "amarillo" }
          : { text: inactivo, badge: "paper" },
    },
    {
      key: "publicationStatus",
      label: t("T-279"),
      render: (row) =>
        row.publicationStatus === "PUBLISHED"
          ? { text: publicado, badge: "azul" }
          : { text: borrador, badge: "sky" },
    },
  ],
  filters: [
    {
      key: "status",
      label: t("T-274"),
      options: [
        { value: "ACTIVE", label: activo },
        { value: "INACTIVE", label: inactivo },
      ],
    },
    {
      key: "publicationStatus",
      label: t("T-279"),
      options: [
        { value: "DRAFT", label: borrador },
        { value: "PUBLISHED", label: publicado },
      ],
    },
  ],
  schema: committeeInputSchema,
  fields,
  list: (params) =>
    listCommittees({
      q: params.q,
      status: params.filters.status,
      publicationStatus: params.filters.publicationStatus,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getCommittee,
  toFormValues: (row) => ({
    slug: row.slug,
    name: row.name,
    status: row.status,
    color: row.color ?? "",
    logoKey: row.logoKey ?? "",
    presentation: row.presentation ?? "",
    contactUrl: row.contactUrl ?? "",
    publicationStatus: row.publicationStatus,
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createCommittee(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateCommittee(ctx, id, input)),
  exportRow: (row) => ({
    sigla: row.slug,
    nombre: row.name,
    estado: row.status,
    publicacion: row.publicationStatus,
    contacto: row.contactUrl,
  }),
};

// Personas: el kit lista, filtra, crea (alta manual de prospectos y externos) y exporta con step-up;
// editar y todo lo demás pasa por la Persona 360 (02-crm.md).

const [personasPlural, personaSingular] = tList("T-420") as [string, string];
const campos = tList("T-427");
const [estudiante, externo] = tList("T-428") as [string, string];
const etapas = tList("T-429");
const estados = tList("T-381");
const [filtroEtapa, filtroEstado, filtroComite] = tList("T-508") as [
  string,
  string,
  string,
  string,
];

export const STAGE_CODES = ["PROSPECT", "APPLICANT", "MEMBER", "ALUMNI"] as const;
export const STATUS_CODES = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"] as const;

export function stageLabel(stage: string): string {
  return etapas[STAGE_CODES.indexOf(stage as (typeof STAGE_CODES)[number])] ?? stage;
}

export function statusLabel(status: string): string {
  return estados[STATUS_CODES.indexOf(status as (typeof STATUS_CODES)[number])] ?? status;
}

const stageBadges: Record<(typeof STAGE_CODES)[number], Badge> = {
  PROSPECT: "sky",
  APPLICANT: "sky",
  MEMBER: "amarillo",
  ALUMNI: "paper",
};

const statusBadges: Record<(typeof STATUS_CODES)[number], Badge> = {
  ACTIVE: "amarillo",
  ON_LEAVE: "sky",
  HONORARY: "azul",
  INACTIVE: "paper",
};

export function stageCell(stage: (typeof STAGE_CODES)[number]): { text: string; badge: Badge } {
  return { text: stageLabel(stage), badge: stageBadges[stage] };
}

export function statusCell(status: (typeof STATUS_CODES)[number]): { text: string; badge: Badge } {
  return { text: statusLabel(status), badge: statusBadges[status] };
}

const personFields: FieldDefinition[] = [
  { name: "firstName", label: campos[0] ?? "", type: "text", required: true },
  { name: "lastName", label: campos[1] ?? "", type: "text", required: true },
  { name: "email", label: campos[2] ?? "", type: "email", required: true },
  {
    name: "kind",
    label: campos[7] ?? "",
    type: "select",
    required: true,
    options: [
      { value: "STUDENT", label: estudiante },
      { value: "EXTERNAL", label: externo },
    ],
  },
  { name: "preferredName", label: campos[3] ?? "", type: "text" },
  { name: "phone", label: campos[4] ?? "", type: "text" },
  { name: "personalEmail", label: campos[5] ?? "", type: "email" },
  { name: "program", label: campos[6] ?? "", type: "text" },
];

export const peopleResource: ResourceDefinition<PersonRow, PersonInput> = {
  key: "personas",
  names: { plural: personasPlural, singular: personaSingular },
  basePath: "/admin/personas",
  columns: [
    {
      key: "name",
      label: campos[0] ?? "",
      render: (row) => ({ text: row.fullName.trim(), href: `/admin/personas/${row.id}` }),
    },
    { key: "email", label: campos[2] ?? "", render: (row) => row.email },
    { key: "stage", label: campos[8] ?? "", render: (row) => stageCell(row.stage) },
    {
      key: "status",
      label: campos[9] ?? "",
      render: (row) => (row.membershipStatus ? statusCell(row.membershipStatus) : null),
    },
    { key: "committees", label: t("T-431"), render: (row) => row.committees.join(", ") || null },
    { key: "firstTerm", label: campos[10] ?? "", render: (row) => row.firstTermCode },
  ],
  filters: async () => [
    {
      key: "stage",
      label: filtroEtapa,
      options: STAGE_CODES.map((value) => ({ value, label: stageLabel(value) })),
    },
    {
      key: "status",
      label: filtroEstado,
      options: STATUS_CODES.map((value) => ({ value, label: statusLabel(value) })),
    },
    {
      key: "committeeId",
      label: filtroComite,
      options: (await listAllCommittees()).map((item) => ({ value: item.id, label: item.name })),
    },
  ],
  schema: personInputSchema,
  fields: personFields,
  list: (params) =>
    listPeople({
      q: params.q,
      stage: params.filters.stage,
      status: params.filters.status,
      committeeId: params.filters.committeeId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: async (id) =>
    (await listPeople({ q: "", personIds: [id], page: 1, pageSize: 1 })).rows[0] ?? null,
  toFormValues: () => ({}),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createPerson(ctx, input)),
  personalData: true,
  exportRow: (row) => ({
    Nombre: row.firstName,
    Apellido: row.lastName,
    Correo: row.email,
    Comités: row.committees.join("; "),
    Estado: row.membershipStatus ? statusLabel(row.membershipStatus) : null,
    "Semestre de ingreso": row.firstTermCode,
    Etapa: stageLabel(row.stage),
  }),
};

// Cargos de comité: catálogo editable (ADR-029), sembrado por la migración 0001.

const [cargosPlural, cargoSingular] = tList("T-421") as [string, string];
const [codigo, nombreCargo, esLiderazgo, orden] = tList("T-473") as [
  string,
  string,
  string,
  string,
];

const roleFields: FieldDefinition[] = [
  { name: "code", label: codigo, type: "text", required: true, lockedOnEdit: true },
  { name: "label", label: nombreCargo, type: "text", required: true },
  { name: "isLeadership", label: esLiderazgo, type: "checkbox" },
  { name: "sortOrder", label: orden, type: "number" },
];

export const rolesResource: ResourceDefinition<CommitteeRoleRow, CommitteeRoleInput> = {
  key: "cargos",
  names: { plural: cargosPlural, singular: cargoSingular },
  basePath: "/admin/cargos",
  columns: [
    { key: "code", label: codigo, render: (row) => row.code },
    { key: "label", label: nombreCargo, render: (row) => row.label },
    {
      key: "isLeadership",
      label: esLiderazgo,
      render: (row) => (row.isLeadership ? { text: esLiderazgo, badge: "amarillo" } : null),
    },
    { key: "sortOrder", label: orden, render: (row) => row.sortOrder },
  ],
  schema: committeeRoleInputSchema,
  fields: roleFields,
  list: (params) => listRoles({ q: params.q, page: params.page, pageSize: params.pageSize }),
  get: getRole,
  toFormValues: (row) => ({
    code: row.code,
    label: row.label,
    isLeadership: row.isLeadership ? "true" : "",
    sortOrder: String(row.sortOrder),
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createCommitteeRole(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateCommitteeRole(ctx, id, input)),
  exportRow: (row) => ({
    codigo: row.code,
    nombre: row.label,
    liderazgo: row.isLeadership ? "sí" : "no",
    orden: row.sortOrder,
  }),
};
