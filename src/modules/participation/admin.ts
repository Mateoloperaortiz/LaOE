import { runCommand } from "@/db/tx";
import type { FieldDefinition, ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import {
  createTerm,
  getTerm,
  listTerms,
  type TermInput,
  type TermRow,
  termInputSchema,
  updateTerm,
} from "./domain/terms";

const [plural, singular] = tList("T-262") as [string, string];

const fields: FieldDefinition[] = [
  { name: "code", label: t("T-280"), type: "text", required: true, placeholder: "2026-2" },
  { name: "startsOn", label: t("T-281"), type: "date", required: true },
  { name: "endsOn", label: t("T-282"), type: "date", required: true },
  { name: "requiredOrdinaryAssemblies", label: t("T-283"), type: "number", required: true },
  { name: "permanenceGeneralNominal", label: t("T-284"), type: "number", required: true },
  { name: "permanenceCommitteeNominal", label: t("T-285"), type: "number", required: true },
];

export const termsResource: ResourceDefinition<TermRow, TermInput> = {
  key: "terminos",
  names: { plural, singular },
  basePath: "/admin/terminos",
  columns: [
    { key: "code", label: t("T-280"), render: (row) => row.code },
    { key: "semester", label: t("T-297"), render: (row) => row.semester },
    { key: "startsOn", label: t("T-281"), render: (row) => row.startsOn },
    { key: "endsOn", label: t("T-282"), render: (row) => row.endsOn },
    {
      key: "pointsClosedAt",
      label: t("T-286"),
      render: (row) => (row.pointsClosedAt ? formatDateTime(row.pointsClosedAt) : null),
    },
  ],
  schema: termInputSchema,
  fields,
  list: (params) => listTerms({ q: params.q, page: params.page, pageSize: params.pageSize }),
  get: getTerm,
  toFormValues: (row) => ({
    code: row.code,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    requiredOrdinaryAssemblies: String(row.requiredOrdinaryAssemblies),
    permanenceGeneralNominal: String(row.permanenceGeneralNominal),
    permanenceCommitteeNominal: String(row.permanenceCommitteeNominal),
  }),
  create: (actor, input) =>
    runCommand({ personId: actor.personId }, (ctx) => createTerm(ctx, input)),
  update: (actor, id, input) =>
    runCommand({ personId: actor.personId }, (ctx) => updateTerm(ctx, id, input)),
  exportRow: (row) => ({
    codigo: row.code,
    semestre: row.semester,
    inicio: row.startsOn,
    fin: row.endsOn,
    asambleas_obligatorias: row.requiredOrdinaryAssemblies,
    puntos_cerrados: row.pointsClosedAt ? row.pointsClosedAt.toISOString() : null,
  }),
};
