import { runCommand } from "@/db/tx";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import {
  type AnnouncementInput,
  type AnnouncementRow,
  announcementInputSchema,
  createAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAndPushAnnouncement,
  publishAnnouncement,
  requestAnnouncementPush,
  unpublishAnnouncement,
  updateAnnouncement,
} from "./domain/announcements";
import {
  createPage,
  getPage,
  listPages,
  type PageInput,
  type PageRow,
  pageInputSchema,
  updatePage,
} from "./domain/pages";

// Recursos del admin de Contenido (ADR-017, ADR-033).

const [borrador, publicado] = tList("T-288");
const [publico, soloMiembros] = tList("T-339");

const statusOptions = [
  { value: "DRAFT", label: borrador },
  { value: "PUBLISHED", label: publicado },
];
const audienceOptions = [
  { value: "PUBLIC", label: publico },
  { value: "MEMBERS", label: soloMiembros },
];

function audienceCell(audience: "PUBLIC" | "MEMBERS") {
  return audience === "PUBLIC"
    ? { text: publico, badge: "amarillo" as const }
    : { text: soloMiembros, badge: "navy" as const };
}

// Páginas fijas (La OE, Unirse, Privacidad y las que se creen).

const [pagesPlural, pagesSingular] = tList("T-330");

const pageFields: FieldDefinition[] = [
  {
    name: "slug",
    label: t("T-349"),
    type: "text",
    required: true,
    lockedOnEdit: true,
    placeholder: "la-oe",
  },
  { name: "title", label: t("T-335"), type: "text", required: true },
  {
    name: "body",
    label: t("T-336"),
    type: "textarea",
    textVariant: "code",
    rows: 18,
    help: t("T-337"),
  },
  { name: "status", label: t("T-279"), type: "select", required: true, options: statusOptions },
  {
    name: "audience",
    label: t("T-338"),
    type: "select",
    required: true,
    options: audienceOptions,
  },
];

export const pagesResource: ResourceDefinition<PageRow, PageInput> = {
  key: "paginas",
  names: { plural: pagesPlural, singular: pagesSingular },
  basePath: "/admin/paginas",
  columns: [
    { key: "title", label: t("T-335"), render: (row) => row.title },
    { key: "slug", label: t("T-349"), render: (row) => row.slug },
    {
      key: "status",
      label: t("T-279"),
      render: (row) =>
        row.status === "PUBLISHED"
          ? { text: publicado, badge: "azul" }
          : { text: borrador, badge: "sky" },
    },
    { key: "audience", label: t("T-338"), render: (row) => audienceCell(row.audience) },
  ],
  filters: [
    { key: "status", label: t("T-279"), options: statusOptions },
    { key: "audience", label: t("T-338"), options: audienceOptions },
  ],
  schema: pageInputSchema,
  fields: pageFields,
  list: (params) =>
    listPages({
      q: params.q,
      status: params.filters.status,
      audience: params.filters.audience,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getPage,
  toFormValues: (row) => ({
    slug: row.slug,
    title: row.title,
    body: row.body,
    status: row.status,
    audience: row.audience,
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createPage(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updatePage(ctx, id, input)),
  exportRow: (row) => ({
    identificador: row.slug,
    titulo: row.title,
    estado: row.status,
    audiencia: row.audience,
    actualizado: row.updatedAt.toISOString(),
  }),
};

// Cartelera: se publica, se avisa por push y se despublica con acciones de fila (ADR-038 regla 6).

const [carteleraPlural, carteleraSingular] = tList("T-331");
const [pushNone, pushSending, pushSent] = tList("T-1114");

const announcementFields: FieldDefinition[] = [
  { name: "title", label: t("T-335"), type: "text", required: true },
  {
    name: "body",
    label: t("T-336"),
    type: "textarea",
    textVariant: "code",
    rows: 12,
    help: t("T-337"),
  },
  {
    name: "audience",
    label: t("T-338"),
    type: "select",
    required: true,
    options: audienceOptions,
  },
  { name: "pinned", label: t("T-340"), type: "checkbox" },
];

export const announcementsResource: ResourceDefinition<AnnouncementRow, AnnouncementInput> = {
  key: "cartelera",
  names: { plural: carteleraPlural, singular: carteleraSingular },
  basePath: "/admin/cartelera",
  columns: [
    { key: "title", label: t("T-335"), render: (row) => row.title },
    { key: "audience", label: t("T-338"), render: (row) => audienceCell(row.audience) },
    {
      key: "publishedAt",
      label: t("T-341"),
      render: (row) =>
        row.publishedAt
          ? { text: formatDateTime(row.publishedAt), badge: "azul" }
          : { text: borrador, badge: "sky" },
    },
    {
      key: "pinned",
      label: t("T-303"),
      render: (row) => (row.pinned ? { text: t("T-303"), badge: "naranja" } : null),
    },
    {
      key: "push",
      label: t("T-1113"),
      render: (row) =>
        row.pushSentAt
          ? { text: pushSent.replace("{n}", String(row.pushCount)), badge: "azul" }
          : row.pushRequestedAt
            ? { text: pushSending, badge: "sky" }
            : pushNone,
    },
  ],
  filters: [
    { key: "publication", label: t("T-279"), options: statusOptions },
    { key: "audience", label: t("T-338"), options: audienceOptions },
  ],
  schema: announcementInputSchema,
  fields: announcementFields,
  list: (params) =>
    listAnnouncements({
      q: params.q,
      audience: params.filters.audience,
      publication: params.filters.publication,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getAnnouncement,
  toFormValues: (row) => ({
    title: row.title,
    body: row.body,
    audience: row.audience,
    pinned: String(row.pinned),
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createAnnouncement(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateAnnouncement(ctx, id, input)),
  rowActions: [
    { key: "publish", label: t("T-342"), applies: (row) => row.publishedAt === null },
    { key: "publish-push", label: t("T-1111"), applies: (row) => row.publishedAt === null },
    {
      key: "push",
      label: t("T-1112"),
      applies: (row) => row.publishedAt !== null && row.pushRequestedAt === null,
    },
    { key: "unpublish", label: t("T-343"), applies: (row) => row.publishedAt !== null },
  ],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "publish") {
      await runCommand({ personId: actor.personId }, (ctx) => publishAnnouncement(ctx, id));
    } else if (actionKey === "publish-push") {
      await runCommand({ personId: actor.personId }, (ctx) => publishAndPushAnnouncement(ctx, id));
    } else if (actionKey === "push") {
      await runCommand({ personId: actor.personId }, (ctx) => requestAnnouncementPush(ctx, id));
    } else if (actionKey === "unpublish") {
      await runCommand({ personId: actor.personId }, (ctx) => unpublishAnnouncement(ctx, id));
    }
  },
  exportRow: (row) => ({
    titulo: row.title,
    audiencia: row.audience,
    publicado_el: row.publishedAt ? row.publishedAt.toISOString() : null,
    push_enviado_el: row.pushSentAt ? row.pushSentAt.toISOString() : null,
    push_personas: row.pushCount,
    fijado: row.pinned ? "sí" : "no",
    creado: row.createdAt.toISOString(),
  }),
};
