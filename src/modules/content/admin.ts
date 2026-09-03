import { runCommand } from "@/db/tx";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
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

const [pagesPlural, pagesSingular] = tList("T-330") as [string, string];

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
  { name: "body", label: t("T-336"), type: "textarea", rows: 18, help: t("T-337") },
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
    {
      key: "audience",
      label: t("T-338"),
      render: (row) =>
        row.audience === "PUBLIC"
          ? { text: publico, badge: "amarillo" }
          : { text: soloMiembros, badge: "navy" },
    },
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
