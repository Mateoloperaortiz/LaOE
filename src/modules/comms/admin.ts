import { z } from "zod";
import type { ResourceDefinition } from "@/shared/admin-kit/types";
import { tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { listMessages, type MessageAdminRow } from "./domain/messages";

// Recursos del admin de Comunicaciones (ADR-017, ADR-038 regla 11): el registro de mensajes es de solo
// lectura; su export lleva nombre y correo, así que exige step-up.

type Empty = Record<string, never>;
const emptySchema = z.object({}) as z.ZodType<Empty, unknown>;

const [mensajesPlural] = tList("T-1142") as [string];
const [colFecha, colPersona, colCanal, colTipo, colAsunto, colEstado, colProveedor, colCampaña] =
  tList("T-1144");
const [fCanal, fTipo, fEstado] = tList("T-1148");
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
  filters: [
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
