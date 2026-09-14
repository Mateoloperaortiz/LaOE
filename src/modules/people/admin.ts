import { readdirSync } from "node:fs";
import { z } from "zod";
import { runCommand } from "@/db/tx";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import type { Badge, FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { MULTI_SEPARATOR } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { COMMITTEE_CAPABILITIES } from "./domain/capabilities";
import { type CommitteeRoleRow, listCommitteeRoles } from "./domain/committee-memberships";
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
import { DOCUMENT_TYPE_CODES } from "./domain/person-pure";
import {
  createPerson,
  listPeople,
  type PersonInput,
  type PersonRow,
  personInputSchema,
} from "./domain/persons";
import {
  listPreferentialSchedule,
  type PreferentialRow,
  preferentialKindLabel,
} from "./domain/preferential-schedule";
import {
  type CommitteeRoleInput,
  committeeRoleInputSchema,
  createCommitteeRole,
  getRole,
  listRoles,
  updateCommitteeRole,
} from "./domain/roles";
import {
  createSegment,
  findPeopleByFilter,
  getSegment,
  listAllSegments,
  listSegments,
  type SegmentInput,
  type SegmentRow,
  segmentInputSchema,
  updateSegment,
} from "./domain/segments";
import {
  createTag,
  getTag,
  listAllTags,
  listTags,
  type TagInput,
  type TagRow,
  tagInputSchema,
  updateTag,
} from "./domain/tags";

// Recursos del admin kit (ADR-017): Comités, Personas (el listado; la ficha es la Persona 360), Cargos,
// Etiquetas y Segmentos.

const [plural, singular] = tList("T-261") as [string, string];
const [activo, inactivo, enPrueba] = tList("T-287") as [string, string, string];
const [pruebaDesde, pruebaHasta, desactivadoEl] = tList("T-2259") as [string, string, string];
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
      { value: "ON_TRIAL", label: enPrueba },
    ],
  },
  // Periodo de prueba y desactivación (Regl. art. 25 y 26; ADR-060 regla 8).
  { name: "trialStartsOn", label: pruebaDesde, type: "date", help: t("T-2260") },
  { name: "trialEndsOn", label: pruebaHasta, type: "date" },
  { name: "deactivatedOn", label: desactivadoEl, type: "date" },
  { name: "lifecycleReason", label: t("T-2332"), type: "textarea" },
  { name: "color", label: t("T-275"), type: "color" },
  { name: "logoKey", label: t("T-276"), type: "select", options: logoOptions() },
  { name: "presentation", label: t("T-277"), type: "textarea", textVariant: "code" },
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
          : row.status === "ON_TRIAL"
            ? { text: enPrueba, badge: "sky" }
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
        { value: "ON_TRIAL", label: enPrueba },
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
    trialStartsOn: row.trialStartsOn ?? "",
    trialEndsOn: row.trialEndsOn ?? "",
    deactivatedOn: row.deactivatedOn ?? "",
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
const [filtroEtapa, filtroEstado, filtroComite, filtroSegmento] = tList("T-508") as [
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
  {
    name: "documentType",
    label: t("T-2010"),
    type: "select",
    options: DOCUMENT_TYPE_CODES.map((value) => ({ value, label: value })),
  },
  { name: "documentNumber", label: t("T-2011"), type: "text" },
  { name: "epikId", label: t("T-2012"), type: "text" },
  { name: "birthDate", label: t("T-2013"), type: "date" },
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
    {
      key: "segmento",
      label: filtroSegmento,
      options: (await listAllSegments()).map((item) => ({ value: item.id, label: item.name })),
    },
  ],
  schema: personInputSchema,
  fields: personFields,
  list: async (params) => {
    let personIds: string[] | undefined;
    if (params.filters.segmento) {
      const segment = await getSegment(params.filters.segmento);
      personIds = segment ? await findPeopleByFilter(segment.filter) : [];
    }
    return listPeople({
      q: params.q,
      stage: params.filters.stage,
      status: params.filters.status,
      committeeId: params.filters.committeeId,
      personIds,
      page: params.page,
      pageSize: params.pageSize,
    });
  },
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
    [t("T-2010")]: row.documentType,
    [t("T-2011")]: row.documentNumber,
    [t("T-2012")]: row.epikId,
    [t("T-2013")]: row.birthDate,
  }),
};

// Cargos de comité: catálogo editable (ADR-029), sembrado por la migración 0001; desde ADR-058
// (migración 0015) cada cargo dice si es dirección, si es obligatorio y qué capacidades habilita.

const [cargosPlural, cargoSingular] = tList("T-421") as [string, string];
const [codigo, nombreCargo, esDireccion, obligatorio, capacidades, orden] = tList("T-473") as [
  string,
  string,
  string,
  string,
  string,
  string,
];
const capacidadLabels = tList("T-2179");
const capabilityOptions = COMMITTEE_CAPABILITIES.map((value, index) => ({
  value,
  label: capacidadLabels[index] ?? value,
}));

function capabilityLabels(codes: string[]): string {
  return capabilityOptions
    .filter((option) => codes.includes(option.value))
    .map((option) => option.label)
    .join(" · ");
}

const [retirado, reemplazo] = tList("T-2209") as [string, string];

const roleFields: FieldDefinition[] = [
  { name: "code", label: codigo, type: "text", required: true, lockedOnEdit: true },
  { name: "label", label: nombreCargo, type: "text", required: true },
  { name: "isLeadership", label: esDireccion, type: "checkbox" },
  { name: "required", label: obligatorio, type: "checkbox", help: t("T-2180") },
  { name: "capabilities", label: capacidades, type: "multiselect", options: capabilityOptions },
  { name: "sortOrder", label: orden, type: "number" },
  // ADR-060 regla 4: un cargo retirado no se ofrece al nombrar y el roster lo traduce al reemplazo.
  { name: "retired", label: retirado, type: "checkbox", help: t("T-2210") },
  { name: "replacedByCode", label: reemplazo, type: "text" },
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
      label: esDireccion,
      render: (row) => (row.isLeadership ? { text: esDireccion, badge: "amarillo" } : null),
    },
    {
      key: "required",
      label: obligatorio,
      render: (row) => (row.required ? { text: obligatorio, badge: "naranja" } : null),
    },
    {
      key: "capabilities",
      label: capacidades,
      render: (row) => capabilityLabels(row.capabilities),
    },
    { key: "sortOrder", label: orden, render: (row) => row.sortOrder },
    {
      key: "retired",
      label: retirado,
      render: (row) =>
        row.retired
          ? {
              text: row.replacedByCode ? `${retirado} → ${row.replacedByCode}` : retirado,
              badge: "paper",
            }
          : null,
    },
  ],
  schema: committeeRoleInputSchema,
  fields: roleFields,
  list: (params) => listRoles({ q: params.q, page: params.page, pageSize: params.pageSize }),
  get: getRole,
  toFormValues: (row) => ({
    code: row.code,
    label: row.label,
    isLeadership: row.isLeadership ? "true" : "",
    required: row.required ? "true" : "",
    capabilities: row.capabilities.join(MULTI_SEPARATOR),
    sortOrder: String(row.sortOrder),
    retired: row.retired ? "true" : "",
    replacedByCode: row.replacedByCode ?? "",
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createCommitteeRole(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateCommitteeRole(ctx, id, input)),
  exportRow: (row) => ({
    codigo: row.code,
    nombre: row.label,
    direccion: row.isLeadership ? "sí" : "no",
    obligatorio: row.required ? "sí" : "no",
    capacidades: capabilityLabels(row.capabilities),
    orden: row.sortOrder,
    retirado: row.retired ? "sí" : "no",
    reemplazo: row.replacedByCode ?? "",
  }),
};

// Etiquetas: marcas libres sobre personas (02-crm.md).

const [etiquetasPlural, etiquetaSingular] = tList("T-422") as [string, string];
const [nombreEtiqueta, colorEtiqueta] = tList("T-465") as [string, string];

export const tagsResource: ResourceDefinition<TagRow, TagInput> = {
  key: "etiquetas",
  names: { plural: etiquetasPlural, singular: etiquetaSingular },
  basePath: "/admin/etiquetas",
  columns: [
    { key: "name", label: nombreEtiqueta, render: (row) => row.name },
    { key: "color", label: colorEtiqueta, render: (row) => row.color },
  ],
  schema: tagInputSchema,
  fields: [
    { name: "name", label: nombreEtiqueta, type: "text", required: true },
    { name: "color", label: colorEtiqueta, type: "color" },
  ],
  list: (params) => listTags({ q: params.q, page: params.page, pageSize: params.pageSize }),
  get: getTag,
  toFormValues: (row) => ({ name: row.name, color: row.color ?? "" }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createTag(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateTag(ctx, id, input)),
  exportRow: (row) => ({ nombre: row.name, color: row.color }),
};

// Segmentos: filtros guardados con conteo y export de personas (con step-up, por /api/export/personas).

const [segmentosPlural, segmentoSingular] = tList("T-424") as [string, string];
const segmentoCampos = tList("T-468");
const ingresoOpciones = tList("T-469");
const consentimientoOpciones = tList("T-470");
const ENTRY_CODES = ["ANY", "NEW", "VETERAN"] as const;
const CONSENT_CODES = ["ANY", "COMMS_YES", "COMMS_NO", "PHOTO_YES", "MEMORIAL_YES"] as const;

async function segmentFields(): Promise<FieldDefinition[]> {
  const [committees, roles, tags] = await Promise.all([
    listAllCommittees(),
    listCommitteeRoles(),
    listAllTags(),
  ]);
  return [
    { name: "name", label: segmentoCampos[0] ?? "", type: "text", required: true },
    {
      name: "stages",
      label: segmentoCampos[1] ?? "",
      type: "multiselect",
      options: STAGE_CODES.map((value) => ({ value, label: stageLabel(value) })),
    },
    {
      name: "statuses",
      label: segmentoCampos[2] ?? "",
      type: "multiselect",
      options: STATUS_CODES.map((value) => ({ value, label: statusLabel(value) })),
    },
    {
      name: "entry",
      label: segmentoCampos[3] ?? "",
      type: "select",
      options: ENTRY_CODES.map((value, index) => ({
        value,
        label: ingresoOpciones[index] ?? value,
      })),
    },
    {
      name: "committeeIds",
      label: segmentoCampos[4] ?? "",
      type: "multiselect",
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
    {
      name: "roleCodes",
      label: segmentoCampos[5] ?? "",
      type: "multiselect",
      options: roles.map((item) => ({ value: item.code, label: item.label })),
    },
    {
      name: "tagIds",
      label: segmentoCampos[6] ?? "",
      type: "multiselect",
      options: tags.map((item) => ({ value: item.id, label: item.name })),
    },
    {
      name: "consent",
      label: segmentoCampos[7] ?? "",
      type: "select",
      options: CONSENT_CODES.map((value, index) => ({
        value,
        label: consentimientoOpciones[index] ?? value,
      })),
    },
    { name: "program", label: segmentoCampos[8] ?? "", type: "text" },
  ];
}

export const segmentsResource: ResourceDefinition<SegmentRow, SegmentInput> = {
  key: "segmentos",
  names: { plural: segmentosPlural, singular: segmentoSingular },
  basePath: "/admin/segmentos",
  columns: [
    { key: "name", label: segmentoCampos[0] ?? "", render: (row) => row.name },
    { key: "count", label: t("T-471"), render: (row) => row.count },
    {
      key: "export",
      label: t("T-472"),
      render: (row) => ({ text: t("T-472"), href: `/api/export/personas?segmento=${row.id}` }),
    },
    {
      key: "createdAt",
      label: t("T-295").split("·")[0]?.trim() ?? "",
      render: (row) => formatDateTime(row.createdAt),
    },
  ],
  schema: segmentInputSchema,
  fields: segmentFields,
  list: (params) => listSegments({ q: params.q, page: params.page, pageSize: params.pageSize }),
  get: getSegment,
  toFormValues: (row) => ({
    name: row.name,
    stages: row.filter.stages.join(MULTI_SEPARATOR),
    statuses: row.filter.statuses.join(MULTI_SEPARATOR),
    entry: row.filter.entry,
    committeeIds: row.filter.committeeIds.join(MULTI_SEPARATOR),
    roleCodes: row.filter.roleCodes.join(MULTI_SEPARATOR),
    tagIds: row.filter.tagIds.join(MULTI_SEPARATOR),
    consent: row.filter.consent,
    program: row.filter.program,
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createSegment(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateSegment(ctx, id, input)),
  exportRow: (row) => ({
    nombre: row.name,
    personas: row.count,
    filtro: JSON.stringify(row.filter),
  }),
};

// Horario preferencial (Regl. art. 72; ADR-060 regla 13): exporte de solo lectura con datos personales.
const [preferencialPlural, preferencialSingular, nombreCol, ambitoCol, cargoCol] = tList("T-2323");
const preferencialEmpty = z.object({});

export const preferentialScheduleResource: ResourceDefinition<
  PreferentialRow,
  z.infer<typeof preferencialEmpty>
> = {
  key: "horario-preferencial",
  names: { plural: preferencialPlural ?? "", singular: preferencialSingular ?? "" },
  basePath: "/admin/horario-preferencial",
  columns: [
    { key: "name", label: nombreCol ?? "", render: (row) => row.name },
    {
      key: "kind",
      label: tList("T-2288")[0] ?? "",
      render: (row) => preferentialKindLabel(row.kind),
    },
    { key: "scope", label: ambitoCol ?? "", render: (row) => row.scope },
    { key: "role", label: cargoCol ?? "", render: (row) => row.roleLabel },
  ],
  filters: async () => [
    {
      key: "termId",
      label: tList("T-262")[1] ?? "",
      options: (await listAllTerms()).map((term) => ({ value: term.id, label: term.code })),
    },
  ],
  schema: preferencialEmpty,
  fields: [],
  list: async (params) => {
    const term = params.filters.termId
      ? (await listAllTerms()).find((item) => item.id === params.filters.termId)
      : await getCurrentTerm();
    if (!term) {
      return { rows: [], total: 0 };
    }
    const rows = await listPreferentialSchedule(term.id);
    return { rows, total: rows.length };
  },
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    nombre: row.name,
    correo: row.email,
    tipo: preferentialKindLabel(row.kind),
    ámbito: row.scope,
    cargo: row.roleLabel,
  }),
};
