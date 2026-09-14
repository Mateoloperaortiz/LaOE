import { runCommand } from "@/db/tx";
import { listReadyPublicMedia } from "@/modules/content";
import { listAllCommittees } from "@/modules/people";
import { MULTI_SEPARATOR } from "@/shared/admin-kit";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import {
  createEdition,
  type EditionInput,
  type EditionListRow,
  editionInputSchema,
  getEdition,
  listEditions,
  updateEdition,
} from "./domain/editions";
import {
  createEvent,
  type EventInput,
  type EventListRow,
  eventInputSchema,
  getEvent,
  listAllEvents,
  listEvents,
  updateEvent,
} from "./domain/events";

// Recursos del admin de eventos y ediciones (ADR-017, ADR-033).

const [borrador, publicado] = tList("T-288") as [string, string];
const [publico, soloMiembros] = tList("T-339") as [string, string];

const statusOptions = [
  { value: "DRAFT", label: borrador },
  { value: "PUBLISHED", label: publicado },
];
const audienceOptions = [
  { value: "PUBLIC", label: publico },
  { value: "MEMBERS", label: soloMiembros },
];

function publicationCell(status: "DRAFT" | "PUBLISHED") {
  return status === "PUBLISHED"
    ? { text: publicado, badge: "azul" as const }
    : { text: borrador, badge: "sky" as const };
}

async function coverField(): Promise<FieldDefinition> {
  const media = await listReadyPublicMedia();
  return {
    name: "coverAssetId",
    label: t("T-346"),
    type: "select",
    emptyOption: t("T-368"),
    options: media.map((item) => ({ value: item.id, label: item.label })),
  };
}

// Eventos permanentes.

const [eventsPlural, eventsSingular] = tList("T-332") as [string, string];

async function eventFields(): Promise<FieldDefinition[]> {
  return [
    {
      name: "slug",
      label: t("T-349"),
      type: "text",
      required: true,
      lockedOnEdit: true,
      placeholder: "dias-eafit",
    },
    { name: "name", label: t("T-273"), type: "text", required: true },
    { name: "summary", label: t("T-344"), type: "text" },
    {
      name: "description",
      label: t("T-345"),
      type: "textarea",
      textVariant: "code",
      rows: 12,
      help: t("T-337"),
    },
    await coverField(),
    {
      name: "audience",
      label: t("T-338"),
      type: "select",
      required: true,
      options: audienceOptions,
    },
    {
      name: "publicationStatus",
      label: t("T-279"),
      type: "select",
      required: true,
      options: statusOptions,
    },
    { name: "sortOrder", label: t("T-355"), type: "number" },
  ];
}

export const eventsResource: ResourceDefinition<EventListRow, EventInput> = {
  key: "eventos",
  names: { plural: eventsPlural, singular: eventsSingular },
  basePath: "/admin/eventos",
  columns: [
    { key: "name", label: t("T-273"), render: (row) => row.name },
    { key: "slug", label: t("T-349"), render: (row) => row.slug },
    {
      key: "publicationStatus",
      label: t("T-279"),
      render: (row) => publicationCell(row.publicationStatus),
    },
    { key: "sortOrder", label: t("T-355"), render: (row) => row.sortOrder },
    {
      key: "editions",
      label: t("T-333").split("·")[0]?.trim() ?? "",
      render: (row) => ({
        text: t("T-369", { n: row.editionCount }),
        href: `/admin/eventos/${row.id}/ediciones`,
      }),
    },
  ],
  filters: [{ key: "publicationStatus", label: t("T-279"), options: statusOptions }],
  schema: eventInputSchema,
  fields: eventFields,
  list: (params) =>
    listEvents({
      q: params.q,
      publicationStatus: params.filters.publicationStatus,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getEvent,
  toFormValues: (row) => ({
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: row.description,
    coverAssetId: row.coverAssetId ?? "",
    audience: row.audience,
    publicationStatus: row.publicationStatus,
    sortOrder: String(row.sortOrder),
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createEvent(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateEvent(ctx, id, input)),
  exportRow: (row) => ({
    identificador: row.slug,
    nombre: row.name,
    resumen: row.summary,
    audiencia: row.audience,
    estado: row.publicationStatus,
    orden: row.sortOrder,
    ediciones: row.editionCount,
  }),
};

// Ediciones: se montan bajo /admin/eventos/[id]/ediciones con el evento como filtro fijo.

const [editionsPlural, editionsSingular] = tList("T-333") as [string, string];

async function editionFields(): Promise<FieldDefinition[]> {
  const [events, committees, cover] = await Promise.all([
    listAllEvents(),
    listAllCommittees(),
    coverField(),
  ]);
  return [
    {
      name: "eventId",
      label: t("T-347"),
      type: "select",
      required: true,
      lockedOnEdit: true,
      options: events.map((item) => ({ value: item.id, label: item.name })),
    },
    { name: "name", label: t("T-348"), type: "text", required: true, placeholder: "2026-2" },
    {
      name: "slug",
      label: t("T-349"),
      type: "text",
      required: true,
      lockedOnEdit: true,
      placeholder: "2026-2",
    },
    { name: "startsAt", label: t("T-350"), type: "datetime", required: true },
    { name: "endsAt", label: t("T-351"), type: "datetime" },
    { name: "location", label: t("T-352"), type: "text" },
    {
      name: "description",
      label: t("T-345"),
      type: "textarea",
      textVariant: "code",
      rows: 10,
      help: t("T-337"),
    },
    cover,
    {
      name: "committeeIds",
      label: t("T-354"),
      type: "multiselect",
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
    { name: "registrationUrl", label: t("T-353"), type: "url" },
    {
      name: "publicationStatus",
      label: t("T-279"),
      type: "select",
      required: true,
      options: statusOptions,
    },
  ];
}

export const editionsResource: ResourceDefinition<EditionListRow, EditionInput> = {
  key: "ediciones",
  names: { plural: editionsPlural, singular: editionsSingular },
  basePath: "/admin/eventos",
  columns: [
    { key: "name", label: t("T-348"), render: (row) => row.name },
    { key: "slug", label: t("T-349"), render: (row) => row.slug },
    { key: "startsAt", label: t("T-350"), render: (row) => formatDateTime(row.startsAt) },
    { key: "location", label: t("T-352"), render: (row) => row.location || null },
    {
      key: "publicationStatus",
      label: t("T-279"),
      render: (row) => publicationCell(row.publicationStatus),
    },
    {
      key: "board",
      label: t("T-2266"),
      render: (row) => ({
        text: t("T-2266"),
        href: `/admin/eventos/${row.eventId}/ediciones/${row.id}/mesa`,
      }),
    },
  ],
  filters: [{ key: "publicationStatus", label: t("T-279"), options: statusOptions }],
  schema: editionInputSchema,
  fields: editionFields,
  list: (params) =>
    listEditions({
      q: params.q,
      eventId: params.filters.eventId,
      publicationStatus: params.filters.publicationStatus,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getEdition,
  toFormValues: (row) => ({
    eventId: row.eventId,
    name: row.name,
    slug: row.slug,
    startsAt: utcToBogotaInput(row.startsAt),
    endsAt: row.endsAt ? utcToBogotaInput(row.endsAt) : "",
    location: row.location,
    description: row.description,
    coverAssetId: row.coverAssetId ?? "",
    committeeIds: row.committeeIds.join(MULTI_SEPARATOR),
    registrationUrl: row.registrationUrl ?? "",
    publicationStatus: row.publicationStatus,
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createEdition(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateEdition(ctx, id, input)),
  exportRow: (row) => ({
    evento: row.eventName,
    nombre: row.name,
    identificador: row.slug,
    empieza: row.startsAt.toISOString(),
    termina: row.endsAt ? row.endsAt.toISOString() : null,
    lugar: row.location,
    estado: row.publicationStatus,
    inscripcion: row.registrationUrl,
  }),
};
