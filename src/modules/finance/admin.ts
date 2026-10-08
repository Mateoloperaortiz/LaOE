import { listAllCommittees, listCommitteesForSelection } from "@/modules/people";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatMoney } from "@/shared/lib/money";
import { BUDGET_KINDS, BUDGET_STATUSES } from "./domain/budget-pure";
import {
  type BudgetInput,
  type BudgetListRow,
  budgetInputSchema,
  budgetKindLabel,
  budgetStatusLabel,
  getBudget,
  listBudgets,
} from "./domain/budgets";
import { createBudgetAs, updateBudgetAs } from "./domain/commands";

// Recurso Presupuestos del kit (ADR-059 regla 2): ADMIN crea el ordinario del año y los extraordinarios;
// los rubros, aprobaciones, apertura, cierre y sanción viven en /admin/presupuestos/[id].

const [plural, singular] = tList("T-2200");
const [comite, año, estado, notas] = tList("T-2201");
const [tipo, actividad, presentadoEl] = tList("T-2288");

const statusOptions = BUDGET_STATUSES.map((value) => ({ value, label: budgetStatusLabel(value) }));
const kindOptions = BUDGET_KINDS.map((value) => ({ value, label: budgetKindLabel(value) }));

function statusCell(status: BudgetListRow["status"]) {
  return {
    text: budgetStatusLabel(status),
    badge:
      status === "OPEN"
        ? ("azul" as const)
        : status === "CLOSED"
          ? ("paper" as const)
          : ("sky" as const),
  };
}

async function fields(): Promise<FieldDefinition[]> {
  const committees = await listCommitteesForSelection();
  return [
    {
      name: "committeeId",
      label: comite,
      type: "select",
      required: true,
      lockedOnEdit: true,
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
    { name: "year", label: año, type: "number", required: true, lockedOnEdit: true },
    {
      name: "kind",
      label: tipo ?? "",
      type: "select",
      required: true,
      lockedOnEdit: true,
      options: kindOptions,
      help: t("T-2305"),
    },
    { name: "title", label: actividad ?? "", type: "text" },
    { name: "submittedOn", label: presentadoEl ?? "", type: "date" },
    { name: "notes", label: notas, type: "textarea", rows: 4 },
  ];
}

export const budgetsResource: ResourceDefinition<BudgetListRow, BudgetInput> = {
  key: "presupuestos",
  names: { plural, singular },
  basePath: "/admin/presupuestos",
  columns: [
    { key: "committee", label: comite, render: (row) => row.committeeName },
    { key: "year", label: año, render: (row) => row.year },
    {
      key: "kind",
      label: tipo ?? "",
      render: (row) =>
        row.kind === "EXTRAORDINARY"
          ? t("T-2309", { actividad: row.title })
          : budgetKindLabel(row.kind),
    },
    { key: "status", label: estado, render: (row) => statusCell(row.status) },
    {
      key: "assigned",
      label: tList("T-2191")[1] ?? "",
      render: (row) => formatMoney(row.assignedTotal),
    },
    {
      key: "detail",
      label: tList("T-2302")[5] ?? "",
      render: (row) => ({ text: tList("T-2302")[5] ?? "", href: `/admin/presupuestos/${row.id}` }),
    },
  ],
  filters: async () => [
    { key: "status", label: estado, options: statusOptions },
    { key: "kind", label: tipo ?? "", options: kindOptions },
    {
      key: "committeeId",
      label: comite,
      options: (await listAllCommittees()).map((item) => ({ value: item.id, label: item.name })),
    },
  ],
  schema: budgetInputSchema,
  fields,
  list: (params) =>
    listBudgets({
      q: params.q,
      committeeId: params.filters.committeeId,
      status: params.filters.status,
      kind: params.filters.kind,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getBudget,
  toFormValues: (row) => ({
    committeeId: row.committeeId,
    year: String(row.year),
    kind: row.kind,
    title: row.title,
    submittedOn: row.submittedOn ?? "",
    notes: row.notes,
  }),
  create: (actor, input) => createBudgetAs(actor, input),
  update: (actor, id, input) => updateBudgetAs(actor, id, input),
  exportRow: (row) => ({
    comité: row.committeeName,
    año: row.year,
    tipo: budgetKindLabel(row.kind),
    actividad: row.title,
    estado: budgetStatusLabel(row.status),
    asignado: row.assignedTotal,
    sanción: row.sanctionPercent,
    presentado: row.submittedOn,
    aprobación_desarrollo_estudiantil: row.studentDevelopmentApprovedOn,
    aprobación_vp_financiera: row.vpFinanceApprovedOn,
  }),
};
