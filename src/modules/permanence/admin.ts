import { z } from "zod";
import { listAllTerms } from "@/modules/terms";
import type { ResourceDefinition } from "@/shared/admin-kit/types";
import { tList } from "@/shared/copy";
import {
  COMPLIANCE_FILTERS,
  type ComplianceRow,
  listComplianceForExport,
} from "./domain/compliance";

// Recursos del kit de permanencia (ADR-017, ADR-036): el exporte de cumplimiento con datos
// personales (step-up) y, en F4-T4, los grupos de trabajo.

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
