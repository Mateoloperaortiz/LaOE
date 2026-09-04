import { listEditionOptions } from "@/modules/events";
import { listAllCommittees } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import type {
  Badge,
  FieldDefinition,
  FilterDefinition,
  ResourceDefinition,
} from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateRange, formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import {
  closeOccasionAs,
  createOccasionAs,
  openOccasionAs,
  updateOccasionAs,
} from "./domain/commands";
import {
  ASSEMBLY_KINDS,
  OCCASION_CATEGORIES,
  OCCASION_KINDS,
  OCCASION_STATUSES,
  type OccasionStatus,
} from "./domain/occasion-pure";
import {
  getOccasion,
  listOccasions,
  type OccasionInput,
  type OccasionListRow,
  occasionInputSchema,
} from "./domain/occasions";

// Recurso del admin para las ocasiones (ADR-017, ADR-035): listado con filtros y acciones Abrir y
// Cerrar; la consola y el modo anfitrión son pantallas a medida.

const [plural, singular] = tList("T-562") as [string, string];
const fieldLabels = tList("T-563");
const kindLabels = tList("T-564");
const assemblyLabels = tList("T-565");
const categoryLabels = tList("T-566");
const approvalLabels = tList("T-567");
const statusLabels = tList("T-568");
const [abrir, cerrar] = tList("T-569") as [string, string];
const filterLabels = tList("T-570");
const columnLabels = tList("T-571");
const shortCategoryLabels = tList("T-521");
const shortKindLabels = tList("T-522");

const kindOptions = OCCASION_KINDS.map((value, index) => ({
  value,
  label: kindLabels[index] ?? value,
}));
const assemblyOptions = ASSEMBLY_KINDS.map((value, index) => ({
  value,
  label: assemblyLabels[index] ?? value,
}));
const categoryOptions = OCCASION_CATEGORIES.map((value, index) => ({
  value,
  label: categoryLabels[index] ?? value,
}));
const approvalOptions = ["AUTO", "MANUAL"].map((value, index) => ({
  value,
  label: approvalLabels[index] ?? value,
}));
const statusOptions = OCCASION_STATUSES.map((value, index) => ({
  value,
  label: statusLabels[index] ?? value,
}));

const STATUS_BADGE: Record<OccasionStatus, Badge> = {
  DRAFT: "sky",
  OPEN: "azul",
  CLOSED: "paper",
  CANCELLED: "naranja",
};

export function occasionStatusCell(status: OccasionStatus): { text: string; badge: Badge } {
  return {
    text: statusLabels[OCCASION_STATUSES.indexOf(status)] ?? status,
    badge: STATUS_BADGE[status],
  };
}

/** Cómo se nombra una ocasión ante un miembro: asamblea con su tipo, actividad por su categoría. */
export function occasionKindLabel(row: {
  kind: (typeof OCCASION_KINDS)[number];
  assemblyKind: (typeof ASSEMBLY_KINDS)[number] | null;
  category: (typeof OCCASION_CATEGORIES)[number];
}): string {
  if (row.kind === "ASSEMBLY") {
    const kind = row.assemblyKind
      ? (assemblyLabels[ASSEMBLY_KINDS.indexOf(row.assemblyKind)] ?? "")
      : "";
    return `${shortKindLabels[1] ?? ""}${kind ? ` · ${kind}` : ""}`;
  }
  if (row.kind === "EDITION_SESSION") {
    return shortKindLabels[2] ?? "";
  }
  return shortCategoryLabels[OCCASION_CATEGORIES.indexOf(row.category)] ?? "";
}

async function filters(): Promise<FilterDefinition[]> {
  const [terms, committees] = await Promise.all([listAllTerms(), listAllCommittees()]);
  return [
    {
      key: "termId",
      label: filterLabels[0] ?? "",
      options: terms.map((term) => ({ value: term.id, label: term.code })),
    },
    { key: "kind", label: filterLabels[1] ?? "", options: kindOptions },
    { key: "status", label: filterLabels[2] ?? "", options: statusOptions },
    {
      key: "committeeId",
      label: filterLabels[3] ?? "",
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
  ];
}

async function fields(): Promise<FieldDefinition[]> {
  const [committees, editions] = await Promise.all([listAllCommittees(), listEditionOptions()]);
  const label = (index: number) => fieldLabels[index] ?? "";
  return [
    { name: "title", label: label(0), type: "text", required: true },
    { name: "kind", label: label(1), type: "select", required: true, options: kindOptions },
    { name: "assemblyKind", label: label(2), type: "select", options: assemblyOptions },
    { name: "category", label: label(3), type: "select", required: true, options: categoryOptions },
    { name: "newMembersOnly", label: label(4), type: "checkbox" },
    { name: "description", label: label(5), type: "textarea", rows: 8, help: t("T-337") },
    { name: "location", label: label(6), type: "text" },
    { name: "startsAt", label: label(7), type: "datetime", required: true },
    { name: "endsAt", label: label(8), type: "datetime" },
    { name: "checkInOpensAt", label: label(9), type: "datetime", help: t("T-580") },
    { name: "checkInClosesAt", label: label(10), type: "datetime" },
    { name: "points", label: label(11), type: "number" },
    {
      name: "approval",
      label: label(12),
      type: "select",
      required: true,
      options: approvalOptions,
    },
    { name: "requireRotatingCode", label: label(13), type: "checkbox", help: t("T-581") },
    {
      name: "committeeId",
      label: label(14),
      type: "select",
      emptyOption: t("T-582"),
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
    {
      name: "editionId",
      label: label(15),
      type: "select",
      emptyOption: t("T-583"),
      options: editions.map((item) => ({ value: item.id, label: item.label })),
    },
  ];
}

export const occasionsResource: ResourceDefinition<OccasionListRow, OccasionInput> = {
  key: "ocasiones",
  names: { plural, singular },
  basePath: "/admin/ocasiones",
  columns: [
    { key: "title", label: columnLabels[0] ?? "", render: (row) => row.title },
    { key: "kind", label: columnLabels[1] ?? "", render: (row) => occasionKindLabel(row) },
    {
      key: "startsAt",
      label: columnLabels[2] ?? "",
      render: (row) => formatDateTime(row.startsAt),
    },
    {
      key: "window",
      label: columnLabels[3] ?? "",
      render: (row) => formatDateRange(row.checkInOpensAt, row.checkInClosesAt),
    },
    { key: "points", label: columnLabels[4] ?? "", render: (row) => row.points },
    {
      key: "status",
      label: columnLabels[5] ?? "",
      render: (row) => occasionStatusCell(row.status),
    },
    { key: "approvedCount", label: columnLabels[6] ?? "", render: (row) => row.approvedCount },
  ],
  filters,
  schema: occasionInputSchema,
  fields,
  list: (params) =>
    listOccasions({
      q: params.q,
      termId: params.filters.termId,
      kind: params.filters.kind,
      status: params.filters.status,
      committeeId: params.filters.committeeId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getOccasion,
  toFormValues: (row) => ({
    title: row.title,
    kind: row.kind,
    assemblyKind: row.assemblyKind ?? "",
    category: row.category,
    newMembersOnly: row.newMembersOnly ? "on" : "",
    description: row.description,
    location: row.location,
    startsAt: utcToBogotaInput(row.startsAt),
    endsAt: row.endsAt ? utcToBogotaInput(row.endsAt) : "",
    checkInOpensAt: utcToBogotaInput(row.checkInOpensAt),
    checkInClosesAt: utcToBogotaInput(row.checkInClosesAt),
    points: String(row.points),
    approval: row.approval,
    requireRotatingCode: row.requireRotatingCode ? "on" : "",
    committeeId: row.committeeId ?? "",
    editionId: row.editionId ?? "",
  }),
  create: (actor, input) => createOccasionAs({ personId: actor.personId }, input),
  update: (actor, id, input) => updateOccasionAs({ personId: actor.personId }, id, input),
  rowActions: [
    { key: "open", label: abrir, applies: (row) => row.status === "DRAFT" },
    { key: "close", label: cerrar, applies: (row) => row.status === "OPEN" },
  ],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "open") {
      await openOccasionAs({ personId: actor.personId }, id);
    } else if (actionKey === "close") {
      await closeOccasionAs({ personId: actor.personId }, id);
    }
  },
  exportRow: (row) => ({
    titulo: row.title,
    tipo: occasionKindLabel(row),
    estado: row.status,
    empieza: row.startsAt.toISOString(),
    termina: row.endsAt ? row.endsAt.toISOString() : null,
    abre_registro: row.checkInOpensAt.toISOString(),
    cierra_registro: row.checkInClosesAt.toISOString(),
    puntos: row.points,
    aprobacion: row.approval,
    codigo_rotativo: row.requireRotatingCode ? "si" : "no",
    solo_nuevos: row.newMembersOnly ? "si" : "no",
    registrados: row.approvedCount,
    enlace: `/a/${row.publicId}`,
  }),
};
