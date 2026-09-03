import { readdirSync } from "node:fs";
import { runCommand } from "@/db/tx";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import {
  type CommitteeInput,
  type CommitteeRow,
  committeeInputSchema,
  createCommittee,
  getCommittee,
  listCommittees,
  updateCommittee,
} from "./domain/committees";

// Recurso "Comités" para el admin kit (ADR-017).

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
