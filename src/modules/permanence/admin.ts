import { z } from "zod";
import { listEditionOptions } from "@/modules/events";
import { findMembersByEmails } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { type BoardExportRow, boardExportRows, boardIndicators } from "./domain/board";
import {
  COMPLIANCE_FILTERS,
  type ComplianceRow,
  listComplianceForExport,
} from "./domain/compliance";
import {
  createGroupAs,
  type GroupInput,
  type GroupListRow,
  getGroup,
  getGroupDetail,
  groupInputSchema,
  listGroups,
  updateGroupAs,
} from "./domain/groups";
import { WORK_GROUP_KINDS } from "./domain/params";

// Recursos del kit de permanencia (ADR-017, ADR-036): el exporte de cumplimiento con datos
// personales (step-up), los grupos de trabajo y el exporte agregado de la junta (ADMIN o BOARD).

type Empty = Record<string, never>;
const emptySchema = z.object({}) as unknown as z.ZodType<Empty, unknown>;

const STATES = ["EN_CAMINO", "EN_RIESGO", "NO_ALCANZA", "CUMPLE", "PRUEBA", "NO_CUMPLE"];
const CONDITIONS = ["ACTIVE", "NEW", "PROBATION", "TRANSFER"];

function stateLabel(state: ComplianceRow["state"]): string {
  return state ? (tList("T-791")[STATES.indexOf(state)] ?? state) : (tList("T-789")[5] ?? "");
}

function conditionLabel(condition: ComplianceRow["condition"]): string {
  return condition ? (tList("T-792")[CONDITIONS.indexOf(condition)] ?? condition) : "";
}

const [title] = [tList("T-788")[0] ?? ""];

export const complianceResource: ResourceDefinition<ComplianceRow, Empty> = {
  key: "permanencia",
  names: { plural: title, singular: title },
  basePath: "/admin/permanencia/cumplimiento",
  columns: [{ key: "personName", label: tList("T-790")[0] ?? "", render: (row) => row.personName }],
  filters: async () => [
    {
      key: "termId",
      label: tList("T-570")[0] ?? "",
      options: (await listAllTerms()).map((term) => ({ value: term.id, label: term.code })),
    },
    {
      key: "filtro",
      label: tList("T-789")[0] ?? "",
      options: COMPLIANCE_FILTERS.map((value, index) => ({
        value,
        label: tList("T-789")[index] ?? value,
      })),
    },
  ],
  schema: emptySchema,
  fields: [],
  list: (params) =>
    listComplianceForExport({
      q: params.q,
      termId: params.filters.termId,
      filter: params.filters.filtro,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => {
    const [
      nombre,
      apellido,
      correo,
      condicion,
      comite,
      general,
      delComite,
      total,
      umbral,
      estado,
      obligatorias,
    ] = tList("T-836");
    const [firstName, ...rest] = row.personName.split(" ");
    return {
      [nombre ?? "nombre"]: firstName ?? "",
      [apellido ?? "apellido"]: rest.join(" "),
      [correo ?? "correo"]: row.email,
      [condicion ?? "condicion"]: conditionLabel(row.condition),
      [comite ?? "comite"]: row.committeeName,
      [general ?? "general"]: row.generalTotal,
      [delComite ?? "del comite"]: row.committeeTotal,
      [total ?? "total"]: row.total,
      [umbral ?? "umbral"]: row.threshold,
      [estado ?? "estado"]: stateLabel(row.state),
      [obligatorias ?? "obligatorias"]: `${row.mandatoryAttended} de ${row.mandatoryTotal}`,
    };
  },
};

// ── Grupos de trabajo (F4-T4) ───────────────────────────────────────────────────────────────

const [groupsPlural, groupsSingular] = tList("T-742");
const groupFieldLabels = tList("T-743");
const groupColumnLabels = tList("T-744");
const groupFilterLabels = tList("T-745");
const groupKindLabels = tList("T-725");
const GROUP_KINDS = [
  "WORK_COMMITTEE",
  "GT_MACROEVENT",
  "GAP",
  "GAP_OE",
  "BARRA_BRAVA",
  "NEW_MEMBER_TASK",
];

const kindOptions = GROUP_KINDS.map((value, index) => ({
  value,
  label: groupKindLabels[index] ?? value,
}));

/** Lo que llega del formulario del kit: el líder viene por correo y se resuelve al guardar. */
const groupFormSchema = z.object({
  termId: z.string().min(1),
  kind: z.enum(WORK_GROUP_KINDS),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().max(20).default(""),
  editionId: z.string().default(""),
  leaderEmail: z.string().trim().toLowerCase().default(""),
});
type GroupForm = z.infer<typeof groupFormSchema>;

async function toGroupInput(form: GroupForm): Promise<GroupInput> {
  let leaderPersonId: string | undefined;
  if (form.leaderEmail) {
    const found = await findMembersByEmails([form.leaderEmail]);
    const leader = found.get(form.leaderEmail);
    if (!leader) {
      throw new DomainError(t("T-032"), "leaderEmail");
    }
    leaderPersonId = leader.id;
  }
  return groupInputSchema.parse({
    termId: form.termId,
    kind: form.kind,
    name: form.name,
    code: form.code,
    editionId: form.editionId,
    leaderPersonId,
  });
}

async function groupFields(): Promise<FieldDefinition[]> {
  const [terms, editions] = await Promise.all([listAllTerms(), listEditionOptions()]);
  const label = (index: number) => groupFieldLabels[index] ?? "";
  return [
    {
      name: "termId",
      label: label(0),
      type: "select",
      required: true,
      lockedOnEdit: true,
      options: terms.map((term) => ({ value: term.id, label: term.code })),
    },
    { name: "kind", label: label(1), type: "select", required: true, options: kindOptions },
    { name: "name", label: label(2), type: "text", required: true },
    { name: "code", label: label(3), type: "text" },
    {
      name: "editionId",
      label: label(4),
      type: "select",
      emptyOption: t("T-583"),
      options: editions.map((item) => ({ value: item.id, label: item.label })),
    },
    { name: "leaderEmail", label: label(6), type: "email", emptyOption: t("T-840") },
  ];
}

export const workGroupsResource: ResourceDefinition<GroupListRow, GroupForm> = {
  key: "grupos",
  names: { plural: groupsPlural, singular: groupsSingular },
  basePath: "/admin/permanencia/grupos",
  columns: [
    {
      key: "name",
      label: groupColumnLabels[0] ?? "",
      render: (row) => ({ text: row.name, href: `/admin/permanencia/grupos/${row.id}` }),
    },
    {
      key: "kind",
      label: groupColumnLabels[1] ?? "",
      render: (row) => groupKindLabels[GROUP_KINDS.indexOf(row.kind)] ?? row.kind,
    },
    { key: "code", label: groupColumnLabels[2] ?? "", render: (row) => row.code },
    {
      key: "leader",
      label: groupColumnLabels[3] ?? "",
      render: (row) => row.leaderName || t("T-757"),
    },
    { key: "members", label: groupColumnLabels[4] ?? "", render: (row) => row.members },
    { key: "evaluators", label: groupColumnLabels[5] ?? "", render: (row) => row.evaluators },
    { key: "pending", label: groupColumnLabels[6] ?? "", render: (row) => row.pending },
  ],
  filters: async () => [
    {
      key: "termId",
      label: groupFilterLabels[0] ?? "",
      options: (await listAllTerms()).map((term) => ({ value: term.id, label: term.code })),
    },
    { key: "kind", label: groupFilterLabels[1] ?? "", options: kindOptions },
  ],
  schema: groupFormSchema,
  fields: groupFields,
  list: (params) =>
    listGroups({
      q: params.q,
      termId: params.filters.termId,
      kind: params.filters.kind,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: async (id) => {
    const rows = await listGroups({
      q: "",
      termId: undefined,
      kind: undefined,
      page: 1,
      pageSize: 1,
    });
    void rows;
    const group = await getGroup(id);
    if (!group) {
      return null;
    }
    const detail = await getGroupDetail(id);
    return {
      ...group,
      leaderName: detail?.leaderName ?? "",
      members: detail?.members.filter((member) => member.leftAt === null).length ?? 0,
      evaluators: detail?.evaluators.length ?? 0,
      pending:
        detail?.members.filter(
          (member) => member.leftAt === null && member.evaluation === "PENDING",
        ).length ?? 0,
    };
  },
  toFormValues: (row) => ({
    termId: row.termId,
    kind: row.kind,
    name: row.name,
    code: row.code ?? "",
    editionId: row.editionId ?? "",
    leaderEmail: "",
  }),
  create: async (actor, input) =>
    createGroupAs({ personId: actor.personId }, await toGroupInput(input)),
  update: async (actor, id, input) => {
    const parsed = await toGroupInput(input);
    const current = await getGroup(id);
    await updateGroupAs({ personId: actor.personId }, id, {
      ...parsed,
      leaderPersonId: parsed.leaderPersonId ?? current?.leaderPersonId ?? undefined,
    });
  },
  exportRow: (row) => ({
    nombre: row.name,
    tipo: groupKindLabels[GROUP_KINDS.indexOf(row.kind)] ?? row.kind,
    codigo: row.code ?? "",
    lider: row.leaderName,
    miembros: row.members,
    evaluadores: row.evaluators,
    pendientes: row.pending,
  }),
};

// ── Junta (F4-T8) ───────────────────────────────────────────────────────────────────────────

const [boardTitle] = tList("T-821");
const boardHeaders = tList("T-837");

/** Solo sirve al exporte `/api/export/junta`: formato largo, sin personas, sin step-up. */
export const boardResource: ResourceDefinition<BoardExportRow, Empty> = {
  key: "junta",
  names: { plural: boardTitle ?? "", singular: boardTitle ?? "" },
  basePath: "/admin/junta",
  columns: [
    { key: "indicator", label: boardHeaders[0] ?? "", render: (row) => row.indicator },
    { key: "value", label: boardHeaders[3] ?? "", render: (row) => String(row.value) },
  ],
  filters: async () => [
    {
      key: "termId",
      label: tList("T-570")[0] ?? "",
      options: (await listAllTerms()).map((term) => ({ value: term.id, label: term.code })),
    },
  ],
  schema: emptySchema,
  fields: [],
  list: async (params) => {
    const termId = params.filters.termId ?? (await listAllTerms())[0]?.id;
    const data = termId ? await boardIndicators(termId) : null;
    const rows = data
      ? boardExportRows(data, {
          cards: tList("T-823"),
          retention: tList("T-825"),
          committees: tList("T-828"),
        })
      : [];
    return { rows, total: rows.length };
  },
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  access: "ADMIN_OR_BOARD",
  personalData: false,
  exportRow: (row) => ({
    [boardHeaders[0] ?? "indicador"]: row.indicator,
    [boardHeaders[1] ?? "comite"]: row.committee,
    [boardHeaders[2] ?? "semestre"]: row.term,
    [boardHeaders[3] ?? "valor"]: row.value,
  }),
};
