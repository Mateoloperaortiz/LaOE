import { runCommand } from "@/db/tx";
import { listCommitteesForSelection } from "@/modules/people";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import {
  getPermission,
  grantPermission,
  listPermissions,
  type PermissionInput,
  type PermissionRow,
  permissionInputSchema,
  revokePermission,
} from "./domain/permissions";

const [plural, singular] = tList("T-263");
const [admin, leader, board] = tList("T-289");
const [grantedAt, grantedBy] = tList("T-295");

const codeLabels: Record<PermissionRow["code"], string> = {
  ADMIN: admin,
  COMMITTEE_LEADER: leader,
  BOARD: board,
};

async function fields(): Promise<FieldDefinition[]> {
  const committees = await listCommitteesForSelection();
  return [
    { name: "email", label: t("T-269"), type: "email", required: true },
    {
      name: "code",
      label: t("T-270"),
      type: "select",
      required: true,
      options: [
        { value: "ADMIN", label: admin },
        { value: "COMMITTEE_LEADER", label: leader },
        { value: "BOARD", label: board },
      ],
    },
    {
      name: "committeeId",
      label: t("T-271"),
      type: "select",
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
  ];
}

export const permissionsResource: ResourceDefinition<PermissionRow, PermissionInput> = {
  key: "permisos",
  names: { plural, singular },
  basePath: "/admin/permisos",
  columns: [
    { key: "person", label: t("T-296"), render: (row) => `${row.personName} · ${row.personEmail}` },
    {
      key: "code",
      label: t("T-270"),
      render: (row) => ({
        text: codeLabels[row.code],
        badge: row.code === "ADMIN" ? "naranja" : "azul",
      }),
    },
    { key: "committee", label: t("T-271"), render: (row) => row.committeeName },
    { key: "grantedAt", label: grantedAt, render: (row) => formatDateTime(row.grantedAt) },
    { key: "grantedBy", label: grantedBy, render: (row) => row.grantedByName },
  ],
  filters: [
    {
      key: "code",
      label: t("T-270"),
      options: [
        { value: "ADMIN", label: admin },
        { value: "COMMITTEE_LEADER", label: leader },
        { value: "BOARD", label: board },
      ],
    },
  ],
  schema: permissionInputSchema,
  fields,
  list: (params) =>
    listPermissions({
      q: params.q,
      code: params.filters.code,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getPermission,
  toFormValues: (row) => ({
    email: row.personEmail,
    code: row.code,
    committeeId: row.committeeId ?? "",
  }),
  create: (actor, input) => runCommand(actor, (ctx) => grantPermission(ctx, input)),
  rowActions: [{ key: "revoke", label: t("T-265") }],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "revoke") {
      await runCommand(actor, (ctx) => revokePermission(ctx, id));
    }
  },
  stepUp: true,
  personalData: true,
  exportRow: (row) => ({
    persona: row.personName,
    correo: row.personEmail,
    permiso: row.code,
    comite: row.committeeName,
    otorgado_el: row.grantedAt.toISOString(),
    otorgado_por: row.grantedByName,
  }),
};
