import { z } from "zod";
import { runCommand } from "@/db/tx";
import { listAllSegments } from "@/modules/people";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import {
  CAMPAIGN_STATUSES,
  type CampaignInput,
  type CampaignListRow,
  campaignInputSchema,
  createCampaign,
  getCampaign,
  listCampaignOptions,
  listCampaigns,
  updateCampaign,
} from "./domain/campaigns";
import { listMessages, type MessageAdminRow } from "./domain/messages";
import {
  createTemplate,
  getTemplate,
  listTemplateOptions,
  listTemplates,
  type TemplateInput,
  type TemplateRow,
  templateInputSchema,
  updateTemplate,
} from "./domain/templates";

// Recursos del admin de Comunicaciones (ADR-017, ADR-038 reglas 8 y 11): plantillas y campañas por el
// kit (la campaña solo se edita en borrador; su detalle es UI a medida) y el registro de mensajes de
// solo lectura, cuyo export lleva nombre y correo y por eso exige step-up.

type Empty = Record<string, never>;
const emptySchema = z.object({}) as z.ZodType<Empty, unknown>;

const [mensajesPlural] = tList("T-1142") as [string];
const [colFecha, colPersona, colCanal, colTipo, colAsunto, colEstado, colProveedor, colCampaña] =
  tList("T-1144");
const [fCanal, fTipo, fEstado, fCampaña] = tList("T-1148");
const channelLabels = tList("T-1145");
const kindLabels = tList("T-1146");
const statusLabels = tList("T-1147");
const providerLabels = tList("T-1150");

const CHANNELS = ["EMAIL", "PUSH"] as const;
export const MESSAGE_KINDS = [
  "TRANSACTIONAL",
  "ANNOUNCEMENT",
  "POINTS",
  "REMINDER",
  "SURVEY",
  "CAMPAIGN",
] as const;
const STATUSES = ["SENT", "FAILED"] as const;
const PROVIDERS = ["console", "resend", "ses", "webpush"] as const;

export function channelLabel(channel: string): string {
  return channelLabels[CHANNELS.indexOf(channel as (typeof CHANNELS)[number])] ?? channel;
}

export function kindLabel(kind: string): string {
  return kindLabels[MESSAGE_KINDS.indexOf(kind as (typeof MESSAGE_KINDS)[number])] ?? kind;
}

export function statusLabel(status: string): string {
  return statusLabels[STATUSES.indexOf(status as (typeof STATUSES)[number])] ?? status;
}

function providerLabel(provider: string): string {
  return providerLabels[PROVIDERS.indexOf(provider as (typeof PROVIDERS)[number])] ?? provider;
}

export const messagesResource: ResourceDefinition<MessageAdminRow, Empty> = {
  key: "mensajes",
  names: { plural: mensajesPlural, singular: mensajesPlural },
  basePath: "/admin/mensajes",
  columns: [
    {
      key: "createdAt",
      label: colFecha ?? "",
      render: (row) => formatDateTime(row.sentAt ?? row.createdAt),
    },
    {
      key: "person",
      label: colPersona ?? "",
      render: (row) => ({
        text: row.personName || row.email,
        href: `/admin/personas/${row.personId}`,
      }),
    },
    {
      key: "channel",
      label: colCanal ?? "",
      render: (row) => ({
        text: channelLabel(row.channel),
        badge: row.channel === "PUSH" ? "amarillo" : "sky",
      }),
    },
    { key: "kind", label: colTipo ?? "", render: (row) => kindLabel(row.kind) },
    { key: "subject", label: colAsunto ?? "", render: (row) => row.subject },
    {
      key: "status",
      label: colEstado ?? "",
      render: (row) => ({
        text: statusLabel(row.status),
        badge: row.status === "SENT" ? "azul" : "naranja",
      }),
    },
    { key: "provider", label: colProveedor ?? "", render: (row) => providerLabel(row.provider) },
    { key: "campaign", label: colCampaña ?? "", render: (row) => row.campaignName ?? null },
  ],
  filters: async () => [
    {
      key: "channel",
      label: fCanal ?? "",
      options: CHANNELS.map((value) => ({ value, label: channelLabel(value) })),
    },
    {
      key: "kind",
      label: fTipo ?? "",
      options: MESSAGE_KINDS.map((value) => ({ value, label: kindLabel(value) })),
    },
    {
      key: "status",
      label: fEstado ?? "",
      options: STATUSES.map((value) => ({ value, label: statusLabel(value) })),
    },
    {
      key: "campaignId",
      label: fCampaña ?? "",
      options: (await listCampaignOptions()).map((item) => ({ value: item.id, label: item.name })),
    },
  ],
  schema: emptySchema,
  fields: [],
  list: (params) =>
    listMessages({
      q: params.q,
      channel: params.filters.channel,
      kind: params.filters.kind,
      status: params.filters.status,
      campaignId: params.filters.campaignId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    fecha: (row.sentAt ?? row.createdAt).toISOString(),
    nombre: row.personName,
    correo: row.email,
    canal: channelLabel(row.channel),
    tipo: kindLabel(row.kind),
    asunto: row.subject,
    estado: statusLabel(row.status),
    proveedor: providerLabel(row.provider),
    campaña: row.campaignName,
    error: row.error,
  }),
};

// Plantillas de correo (regla 8): identificador, nombre, asunto y cuerpo Markdown; el nombre enlaza a
// la vista previa con "Enviarme una prueba".

const [plantillasPlural] = tList("T-1115") as [string];
const [tColIdentificador, tColNombre, tColAsunto, tColActualizada] = tList("T-1116");
const [fieldSlug, fieldName, fieldSubject, fieldBody] = tList("T-1117");

const templateFields: FieldDefinition[] = [
  { name: "slug", label: fieldSlug ?? "", type: "text", required: true, placeholder: "bienvenida" },
  { name: "name", label: fieldName ?? "", type: "text", required: true },
  { name: "subject", label: fieldSubject ?? "", type: "text", required: true },
  { name: "body", label: fieldBody ?? "", type: "textarea", rows: 14, help: t("T-1118") },
];

export const templatesResource: ResourceDefinition<TemplateRow, TemplateInput> = {
  key: "plantillas",
  names: { plural: plantillasPlural, singular: plantillasPlural },
  basePath: "/admin/plantillas",
  columns: [
    { key: "slug", label: tColIdentificador ?? "", render: (row) => row.slug },
    {
      key: "name",
      label: tColNombre ?? "",
      render: (row) => ({ text: row.name, href: `/admin/plantillas/${row.id}` }),
    },
    { key: "subject", label: tColAsunto ?? "", render: (row) => row.subject },
    {
      key: "updatedAt",
      label: tColActualizada ?? "",
      render: (row) => formatDateTime(row.updatedAt),
    },
  ],
  schema: templateInputSchema,
  fields: templateFields,
  list: (params) => listTemplates({ q: params.q, page: params.page, pageSize: params.pageSize }),
  get: getTemplate,
  toFormValues: (row) => ({
    slug: row.slug,
    name: row.name,
    subject: row.subject,
    body: row.body,
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createTemplate(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateTemplate(ctx, id, input)),
  exportRow: (row) => ({
    identificador: row.slug,
    nombre: row.name,
    asunto: row.subject,
    actualizada: row.updatedAt.toISOString(),
  }),
};

// Campañas (regla 8): nombre, plantilla y segmento; el nombre enlaza al detalle a medida.

const [campañasPlural] = tList("T-1123") as [string];
const [cNombre, cPlantilla, cSegmento, cEstado, cProgramada, cEnviados] = tList("T-1125");
const [fNombre, fPlantilla, fSegmento] = tList("T-1126");
const campaignStatusLabels = tList("T-1127");

export function campaignStatusLabel(status: string): string {
  return (
    campaignStatusLabels[CAMPAIGN_STATUSES.indexOf(status as (typeof CAMPAIGN_STATUSES)[number])] ??
    status
  );
}

function campaignBadge(status: string): "sky" | "amarillo" | "naranja" | "azul" | "paper" {
  switch (status) {
    case "SCHEDULED":
      return "amarillo";
    case "SENDING":
      return "naranja";
    case "SENT":
      return "azul";
    case "CANCELLED":
      return "paper";
    default:
      return "sky";
  }
}

export const campaignsResource: ResourceDefinition<CampaignListRow, CampaignInput> = {
  key: "campanas",
  names: { plural: campañasPlural, singular: campañasPlural },
  basePath: "/admin/campanas",
  columns: [
    {
      key: "name",
      label: cNombre ?? "",
      render: (row) => ({ text: row.name, href: `/admin/campanas/${row.id}` }),
    },
    { key: "template", label: cPlantilla ?? "", render: (row) => row.templateName },
    { key: "segment", label: cSegmento ?? "", render: (row) => row.segmentName },
    {
      key: "status",
      label: cEstado ?? "",
      render: (row) => ({
        text: campaignStatusLabel(row.status),
        badge: campaignBadge(row.status),
      }),
    },
    {
      key: "scheduledAt",
      label: cProgramada ?? "",
      render: (row) => (row.scheduledAt ? formatDateTime(row.scheduledAt) : null),
    },
    {
      key: "sent",
      label: cEnviados ?? "",
      render: (row) => (row.status === "DRAFT" ? null : `${row.sentCount} / ${row.totalCount}`),
    },
  ],
  filters: [
    {
      key: "status",
      label: cEstado ?? "",
      options: CAMPAIGN_STATUSES.map((value) => ({ value, label: campaignStatusLabel(value) })),
    },
  ],
  schema: campaignInputSchema,
  fields: async () => [
    { name: "name", label: fNombre ?? "", type: "text", required: true },
    {
      name: "templateId",
      label: fPlantilla ?? "",
      type: "select",
      required: true,
      options: (await listTemplateOptions()).map((item) => ({ value: item.id, label: item.name })),
    },
    {
      name: "segmentId",
      label: fSegmento ?? "",
      type: "select",
      required: true,
      options: (await listAllSegments()).map((item) => ({ value: item.id, label: item.name })),
    },
  ],
  list: (params) =>
    listCampaigns({
      q: params.q,
      status: params.filters.status,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getCampaign,
  toFormValues: (row) => ({ name: row.name, templateId: row.templateId, segmentId: row.segmentId }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createCampaign(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateCampaign(ctx, id, input)),
  exportRow: (row) => ({
    nombre: row.name,
    plantilla: row.templateName,
    segmento: row.segmentName,
    estado: campaignStatusLabel(row.status),
    programada: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    total: row.totalCount,
    enviados: row.sentCount,
    fallidos: row.failedCount,
    omitidos: row.skippedCount,
  }),
};
