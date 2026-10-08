import { z } from "zod";
import { runCommand } from "@/db/tx";
import { listEditionOptions } from "@/modules/events";
import { listSurveyFormOptions } from "@/modules/forms";
import { getPeopleByIds, listAllCommittees, listCommitteesForSelection } from "@/modules/people";
import { createAlias, getAlias, type LegacyAliasRow, listAliases } from "@/modules/system";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import type {
  Badge,
  FieldDefinition,
  FilterDefinition,
  ResourceDefinition,
} from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateRange, formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import { type AssemblyOverviewRow, assemblyOverview } from "./domain/assemblies";
import {
  closeOccasionAs,
  createOccasionAs,
  openOccasionAs,
  updateOccasionAs,
} from "./domain/commands";
import {
  type AchievementExportRow,
  type ChallengeParticipationExportRow,
  type CheckInExportRow,
  listAchievementsForExport,
  listCheckInsForExport,
  listParticipationsForExport,
} from "./domain/exports";
import { type LedgerListRow, listLedger } from "./domain/ledger";
import { POINT_ENTRY_KINDS } from "./domain/ledger-pure";
import {
  ASSEMBLY_KINDS,
  isShortNotice,
  OCCASION_CATEGORIES,
  OCCASION_KINDS,
  OCCASION_STATUSES,
  type OccasionStatus,
} from "./domain/occasion-pure";
import {
  getOccasion,
  getOccasionsByIds,
  listOccasions,
  type OccasionInput,
  type OccasionListRow,
  occasionInputSchema,
} from "./domain/occasions";
import { type Board, rankPeople } from "./domain/rankings";

// Recurso del admin para las ocasiones (ADR-017, ADR-035): listado con filtros y acciones Abrir y
// Cerrar; la consola y el modo anfitrión son pantallas a medida.

const [plural, singular] = tList("T-562");
const fieldLabels = tList("T-563");
const kindLabels = tList("T-564");
const assemblyLabels = tList("T-565");
const categoryLabels = tList("T-566");
const approvalLabels = tList("T-567");
const statusLabels = tList("T-568");
const [abrir, cerrar, consola] = tList("T-569");
const filterLabels = tList("T-570");
const columnLabels = tList("T-571");
const shortCategoryLabels = tList("T-521");
const shortKindLabels = tList("T-522");

const kindOptions = OCCASION_KINDS.map((value, index) => ({
  value,
  label: kindLabels[index] ?? value,
}));
const assemblyOptions = ASSEMBLY_KINDS.map((value, index) => ({
  value,
  label: assemblyLabels[index] ?? value,
}));
const categoryOptions = OCCASION_CATEGORIES.map((value, index) => ({
  value,
  label: categoryLabels[index] ?? value,
}));
const approvalOptions = ["AUTO", "MANUAL"].map((value, index) => ({
  value,
  label: approvalLabels[index] ?? value,
}));
const statusOptions = OCCASION_STATUSES.map((value, index) => ({
  value,
  label: statusLabels[index] ?? value,
}));

const STATUS_BADGE: Record<OccasionStatus, Badge> = {
  DRAFT: "sky",
  OPEN: "azul",
  CLOSED: "paper",
  CANCELLED: "naranja",
};

export function occasionStatusCell(status: OccasionStatus): { text: string; badge: Badge } {
  return {
    text: statusLabels[OCCASION_STATUSES.indexOf(status)] ?? status,
    badge: STATUS_BADGE[status],
  };
}

/** Cómo se nombra una ocasión ante un miembro: asamblea con su tipo, actividad por su categoría. */
export function occasionKindLabel(row: {
  kind: (typeof OCCASION_KINDS)[number];
  assemblyKind: (typeof ASSEMBLY_KINDS)[number] | null;
  category: (typeof OCCASION_CATEGORIES)[number];
}): string {
  if (row.kind === "ASSEMBLY") {
    const kind = row.assemblyKind
      ? (assemblyLabels[ASSEMBLY_KINDS.indexOf(row.assemblyKind)] ?? "")
      : "";
    return `${shortKindLabels[1] ?? ""}${kind ? ` · ${kind}` : ""}`;
  }
  if (row.kind === "EDITION_SESSION") {
    return shortKindLabels[2] ?? "";
  }
  return shortCategoryLabels[OCCASION_CATEGORIES.indexOf(row.category)] ?? "";
}

async function filters(): Promise<FilterDefinition[]> {
  const [terms, committees] = await Promise.all([listAllTerms(), listAllCommittees()]);
  return [
    {
      key: "termId",
      label: filterLabels[0] ?? "",
      options: terms.map((term) => ({ value: term.id, label: term.code })),
    },
    { key: "kind", label: filterLabels[1] ?? "", options: kindOptions },
    { key: "status", label: filterLabels[2] ?? "", options: statusOptions },
    {
      key: "committeeId",
      label: filterLabels[3] ?? "",
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
  ];
}

async function fields(): Promise<FieldDefinition[]> {
  const [committees, editions, surveys] = await Promise.all([
    listCommitteesForSelection(),
    listEditionOptions(),
    listSurveyFormOptions(),
  ]);
  const label = (index: number) => fieldLabels[index] ?? "";
  return [
    { name: "title", label: label(0), type: "text", required: true },
    { name: "kind", label: label(1), type: "select", required: true, options: kindOptions },
    { name: "assemblyKind", label: label(2), type: "select", options: assemblyOptions },
    { name: "category", label: label(3), type: "select", required: true, options: categoryOptions },
    { name: "newMembersOnly", label: label(4), type: "checkbox" },
    {
      name: "description",
      label: label(5),
      type: "textarea",
      textVariant: "code",
      rows: 8,
      help: t("T-337"),
    },
    { name: "location", label: label(6), type: "text" },
    { name: "startsAt", label: label(7), type: "datetime", required: true },
    { name: "endsAt", label: label(8), type: "datetime" },
    { name: "checkInOpensAt", label: label(9), type: "datetime", help: t("T-580") },
    { name: "checkInClosesAt", label: label(10), type: "datetime" },
    { name: "points", label: label(11), type: "number" },
    {
      name: "approval",
      label: label(12),
      type: "select",
      required: true,
      options: approvalOptions,
    },
    { name: "requireRotatingCode", label: label(13), type: "checkbox", help: t("T-581") },
    {
      name: "committeeId",
      label: label(14),
      type: "select",
      emptyOption: t("T-582"),
      options: committees.map((item) => ({ value: item.id, label: item.name })),
    },
    {
      name: "editionId",
      label: label(15),
      type: "select",
      emptyOption: t("T-583"),
      options: editions.map((item) => ({ value: item.id, label: item.label })),
    },
    {
      name: "surveyFormId",
      label: t("T-1158"),
      type: "select",
      emptyOption: t("T-1159"),
      help: t("T-1160"),
      options: surveys.map((item) => ({ value: item.id, label: item.label })),
    },
  ];
}

export const occasionsResource: ResourceDefinition<OccasionListRow, OccasionInput> = {
  key: "ocasiones",
  names: { plural, singular },
  basePath: "/admin/ocasiones",
  columns: [
    { key: "title", label: columnLabels[0] ?? "", render: (row) => row.title },
    {
      key: "kind",
      label: columnLabels[1] ?? "",
      render: (row) =>
        row.kind === "ASSEMBLY" && isShortNotice(row.createdAt, row.startsAt)
          ? { text: `${occasionKindLabel(row)} · ${t("T-2319")}`, badge: "naranja" as const }
          : occasionKindLabel(row),
    },
    {
      key: "startsAt",
      label: columnLabels[2] ?? "",
      render: (row) => formatDateTime(row.startsAt),
    },
    {
      key: "window",
      label: columnLabels[3] ?? "",
      render: (row) => formatDateRange(row.checkInOpensAt, row.checkInClosesAt),
    },
    { key: "points", label: columnLabels[4] ?? "", render: (row) => row.points },
    {
      key: "status",
      label: columnLabels[5] ?? "",
      render: (row) => occasionStatusCell(row.status),
    },
    { key: "approvedCount", label: columnLabels[6] ?? "", render: (row) => row.approvedCount },
    {
      key: "console",
      label: consola,
      render: (row) => ({ text: consola, href: `/admin/ocasiones/${row.id}` }),
    },
  ],
  filters,
  schema: occasionInputSchema,
  fields,
  list: (params) =>
    listOccasions({
      q: params.q,
      termId: params.filters.termId,
      kind: params.filters.kind,
      status: params.filters.status,
      committeeId: params.filters.committeeId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: getOccasion,
  toFormValues: (row) => ({
    title: row.title,
    kind: row.kind,
    assemblyKind: row.assemblyKind ?? "",
    category: row.category,
    newMembersOnly: row.newMembersOnly ? "on" : "",
    description: row.description,
    location: row.location,
    startsAt: utcToBogotaInput(row.startsAt),
    endsAt: row.endsAt ? utcToBogotaInput(row.endsAt) : "",
    checkInOpensAt: utcToBogotaInput(row.checkInOpensAt),
    checkInClosesAt: utcToBogotaInput(row.checkInClosesAt),
    points: String(row.points),
    approval: row.approval,
    requireRotatingCode: row.requireRotatingCode ? "on" : "",
    committeeId: row.committeeId ?? "",
    editionId: row.editionId ?? "",
    surveyFormId: row.surveyFormId ?? "",
  }),
  create: (actor, input) => createOccasionAs(actor, input),
  update: (actor, id, input) => updateOccasionAs(actor, id, input),
  rowActions: [
    { key: "open", label: abrir, applies: (row) => row.status === "DRAFT" },
    { key: "close", label: cerrar, applies: (row) => row.status === "OPEN" },
  ],
  runRowAction: async (actor, actionKey, id) => {
    if (actionKey === "open") {
      await openOccasionAs(actor, id);
    } else if (actionKey === "close") {
      await closeOccasionAs(actor, id);
    }
  },
  exportRow: (row) => ({
    titulo: row.title,
    tipo: occasionKindLabel(row),
    estado: row.status,
    empieza: row.startsAt.toISOString(),
    termina: row.endsAt ? row.endsAt.toISOString() : null,
    abre_registro: row.checkInOpensAt.toISOString(),
    cierra_registro: row.checkInClosesAt.toISOString(),
    puntos: row.points,
    aprobacion: row.approval,
    codigo_rotativo: row.requireRotatingCode ? "si" : "no",
    solo_nuevos: row.newMembersOnly ? "si" : "no",
    registrados: row.approvedCount,
    enlace: `/a/${row.publicId}`,
  }),
};

// Recursos de solo lectura para los exportes CSV (ADR-035 regla 17): check-ins, ledger, rankings y
// asambleas llevan datos personales (step-up y auditoría); las ocasiones no.

const emptySchema = z.object({});
type Empty = z.infer<typeof emptySchema>;

async function termFilter(label: string): Promise<FilterDefinition> {
  const terms = await listAllTerms();
  return {
    key: "termId",
    label,
    options: terms.map((term) => ({ value: term.id, label: term.code })),
  };
}

const [checkInsPlural, checkInsSingular] = tList("T-662");

export const checkInsResource: ResourceDefinition<CheckInExportRow, Empty> = {
  key: "check-ins",
  names: { plural: checkInsPlural, singular: checkInsSingular },
  basePath: "/admin/ocasiones",
  columns: [{ key: "personName", label: tList("T-595")[0] ?? "", render: (row) => row.personName }],
  filters: async () => [
    await termFilter(filterLabels[0] ?? ""),
    { key: "occasionId", label: singular, options: [] },
  ],
  schema: emptySchema,
  fields: [],
  list: (params) =>
    listCheckInsForExport({
      q: params.q,
      termId: params.filters.termId,
      occasionId: params.filters.occasionId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    nombre: row.personName,
    correo: row.email,
    ocasion: row.occasionTitle,
    fecha: row.at.toISOString(),
    fuente: row.source,
    estado: row.status,
    motivo: row.reason,
  }),
};

const [ledgerPlural, ledgerSingular] = tList("T-663");
const kindLabelsForLedger = tList("T-085");

interface LedgerExportRow extends LedgerListRow {
  personName: string;
  email: string;
  termCode: string;
}

export const ledgerResource: ResourceDefinition<LedgerExportRow, Empty> = {
  key: "ledger",
  names: { plural: ledgerPlural, singular: ledgerSingular },
  basePath: "/admin/ledger",
  columns: [{ key: "reason", label: tList("T-623")[5] ?? "", render: (row) => row.reason }],
  filters: async () => [
    await termFilter(filterLabels[0] ?? ""),
    { key: "personId", label: tList("T-624")[0] ?? "", options: [] },
    {
      key: "kind",
      label: tList("T-624")[2] ?? "",
      options: POINT_ENTRY_KINDS.map((value, index) => ({
        value,
        label: kindLabelsForLedger[index] ?? value,
      })),
    },
  ],
  schema: emptySchema,
  fields: [],
  list: async (params) => {
    const [result, terms] = await Promise.all([
      listLedger({
        personId: params.filters.personId,
        termId: params.filters.termId,
        kind: params.filters.kind,
        page: params.page,
        pageSize: params.pageSize,
      }),
      listAllTerms(),
    ]);
    const people = await getPeopleByIds(result.rows.map((row) => row.personId));
    const termCode = new Map(terms.map((term) => [term.id, term.code]));
    return {
      total: result.total,
      rows: result.rows.map((row) => ({
        ...row,
        personName: people.get(row.personId)?.fullName?.trim() ?? "",
        email: people.get(row.personId)?.email ?? "",
        termCode: termCode.get(row.termId) ?? "",
      })),
    };
  },
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    fecha: row.createdAt.toISOString(),
    nombre: row.personName,
    correo: row.email,
    semestre: row.termCode,
    movimiento: kindLabelsForLedger[POINT_ENTRY_KINDS.indexOf(row.kind)] ?? row.kind,
    puntos: row.points,
    motivo: row.reason,
    revertida: row.reversedById ? "si" : "no",
  }),
};

const [rankingsPlural, rankingsSingular] = tList("T-664");
const [tabNuevos, tabVeteranos] = tList("T-083");

interface RankingExportRow {
  id: string;
  rank: number;
  board: Board;
  name: string;
  firstTermCode: string;
  total: number;
}

export const rankingsResource: ResourceDefinition<RankingExportRow, Empty> = {
  key: "rankings",
  names: { plural: rankingsPlural, singular: rankingsSingular },
  basePath: "/admin/rankings",
  columns: [{ key: "name", label: tList("T-636")[1] ?? "", render: (row) => row.name }],
  filters: async () => [
    await termFilter(filterLabels[0] ?? ""),
    {
      key: "board",
      label: tList("T-083").join(" · "),
      options: [
        { value: "NEW", label: tabNuevos ?? "NEW" },
        { value: "VETERAN", label: tabVeteranos ?? "VETERAN" },
      ],
    },
  ],
  schema: emptySchema,
  fields: [],
  list: async (params) => {
    const terms = await listAllTerms();
    const term =
      terms.find((item) => item.id === params.filters.termId) ??
      (await getCurrentTerm()) ??
      terms[0];
    if (!term) {
      return { rows: [], total: 0 };
    }
    const termCode = new Map(terms.map((item) => [item.id, item.code]));
    const boards: Board[] =
      params.filters.board === "NEW" || params.filters.board === "VETERAN"
        ? [params.filters.board]
        : ["NEW", "VETERAN"];
    const rows: RankingExportRow[] = [];
    for (const board of boards) {
      for (const item of await rankPeople(term.id, board)) {
        rows.push({
          id: `${board}-${item.row.personId}`,
          rank: item.rank,
          board,
          name: item.row.anonymized ? t("T-223") : item.row.name,
          firstTermCode: termCode.get(item.row.firstTermId) ?? "",
          total: item.total,
        });
      }
    }
    return { rows, total: rows.length };
  },
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    puesto: row.rank,
    tablero: row.board === "NEW" ? (tabNuevos ?? "") : (tabVeteranos ?? ""),
    nombre: row.name,
    semestre_de_ingreso: row.firstTermCode,
    puntos: row.total,
  }),
};

const [assembliesPlural, assembliesSingular] = tList("T-665");

type AssemblyExportRow = AssemblyOverviewRow & { id: string };

export const assembliesResource: ResourceDefinition<AssemblyExportRow, Empty> = {
  key: "asambleas",
  names: { plural: assembliesPlural, singular: assembliesSingular },
  basePath: "/admin/asambleas",
  columns: [{ key: "name", label: tList("T-638")[0] ?? "", render: (row) => row.name }],
  filters: async () => [await termFilter(filterLabels[0] ?? "")],
  schema: emptySchema,
  fields: [],
  list: async (params) => {
    const terms = await listAllTerms();
    const term =
      terms.find((item) => item.id === params.filters.termId) ??
      (await getCurrentTerm()) ??
      terms[0];
    if (!term) {
      return { rows: [], total: 0 };
    }
    const rows = (await assemblyOverview(term)).map((row) => ({ ...row, id: row.personId }));
    return { rows, total: rows.length };
  },
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    nombre: row.anonymized ? t("T-223") : row.name,
    ordinarias_requeridas: row.requirement.requiredOrdinary,
    ordinarias_firmadas: row.compliance.ordinaryAttended,
    eleccion_requerida: row.requirement.requiresBoardElection ? "si" : "no",
    eleccion_firmada: row.compliance.boardElectionAttended ? "si" : "no",
    segunda_vuelta_requerida: row.requirement.requiresRunoff ? "si" : "no",
    segunda_vuelta_firmada: row.compliance.runoffAttended ? "si" : "no",
    cumple: row.compliance.compliant ? "si" : "no",
    ajustado: row.requirement.adjusted ? "si" : "no",
  }),
};

// Export de participaciones en retos (ADR-067 regla 16, cabeceras T-2570): lleva datos
// personales, así que pide step-up y audita como los demás exportes.

export const challengeParticipationsResource: ResourceDefinition<
  ChallengeParticipationExportRow,
  Empty
> = {
  key: "retos",
  names: {
    plural: tList("T-2574")[0] ?? "",
    singular: tList("T-2404")[1] ?? "",
  },
  basePath: "/admin/gamificacion/retos",
  columns: [
    { key: "challengeTitle", label: tList("T-2570")[0] ?? "", render: (row) => row.challengeTitle },
  ],
  filters: async () => [await termFilter(tList("T-2565")[0] ?? "")],
  schema: emptySchema,
  fields: [],
  list: (params) =>
    listParticipationsForExport({
      termId: params.filters.termId,
      challengeId: params.filters.challengeId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    reto: row.challengeTitle,
    formato: row.kind,
    semestre: row.termCode,
    persona: row.personName,
    correo: row.email,
    estado: row.status,
    enviado: row.submittedAt.toISOString(),
    base: row.base,
    extra: row.extra,
    booster: row.boosterKind,
    decidido: row.decidedAt ? row.decidedAt.toISOString() : null,
  }),
};

// Export de insignias (ADR-067 regla 16): una fila por logro; datos personales → step-up.

const achievementColumns = tList("T-2571");

export const achievementsResource: ResourceDefinition<AchievementExportRow, Empty> = {
  key: "insignias",
  names: {
    plural: tList("T-2404")[4] ?? "",
    singular: tList("T-2404")[4] ?? "",
  },
  basePath: "/admin/gamificacion/insignias",
  columns: [
    {
      key: "badgeName",
      label: achievementColumns[2] ?? "",
      render: (row) => `${row.badgeName} · ${row.level}`,
    },
  ],
  filters: async () => [await termFilter(tList("T-2565")[0] ?? "")],
  schema: emptySchema,
  fields: [],
  list: (params) =>
    listAchievementsForExport({
      termId: params.filters.termId,
      page: params.page,
      pageSize: params.pageSize,
    }),
  get: () => Promise.resolve(null),
  toFormValues: () => ({}),
  personalData: true,
  exportRow: (row) => ({
    persona: row.personName,
    correo: row.email,
    insignia: row.badgeName,
    nivel: row.level,
    desbloqueada: row.unlockedAt.toISOString(),
    historica: row.historical ? "si" : "no",
    revocada: row.revokedAt ? row.revokedAt.toISOString() : null,
  }),
};

// Alias legados (ADR-018, ADR-035 regla 3): vive aquí porque el destino es una ocasión.

const [aliasesPlural, aliasesSingular] = tList("T-658");
const aliasColumns = tList("T-659");

export const aliasInputSchema = z.object({
  path: z.string().trim().min(3).max(60),
  targetId: z.string().trim().min(1),
});

type AliasInput = z.infer<typeof aliasInputSchema>;

interface AliasRow extends LegacyAliasRow {
  occasionTitle: string;
}

async function aliasRows(rows: LegacyAliasRow[]): Promise<AliasRow[]> {
  const occasions = await getOccasionsByIds(rows.map((row) => row.targetId));
  return rows.map((row) => ({ ...row, occasionTitle: occasions.get(row.targetId)?.title ?? "" }));
}

export const aliasesResource: ResourceDefinition<AliasRow, AliasInput> = {
  key: "alias",
  names: { plural: aliasesPlural, singular: aliasesSingular },
  basePath: "/admin/sistema/alias",
  columns: [
    { key: "path", label: aliasColumns[0] ?? "", render: (row) => row.path },
    {
      key: "occasion",
      label: aliasColumns[1] ?? "",
      render: (row) => ({ text: row.occasionTitle, href: `/admin/ocasiones/${row.targetId}` }),
    },
    {
      key: "createdAt",
      label: aliasColumns[2] ?? "",
      render: (row) => formatDateTime(row.createdAt),
    },
  ],
  schema: aliasInputSchema,
  fields: async () => {
    const occasions = await listOccasions({ q: "", page: 1, pageSize: 200 });
    return [
      {
        name: "path",
        label: aliasColumns[0] ?? "",
        type: "text",
        required: true,
        placeholder: "/asamblea/abcdefghjk",
      },
      {
        name: "targetId",
        label: aliasColumns[1] ?? "",
        type: "select",
        required: true,
        options: occasions.rows.map((row) => ({ value: row.id, label: row.title })),
      },
    ];
  },
  list: async (params) => {
    const result = await listAliases({ q: params.q, page: params.page, pageSize: params.pageSize });
    return { total: result.total, rows: await aliasRows(result.rows) };
  },
  get: async (id) => {
    const row = await getAlias(id);
    return row ? ((await aliasRows([row]))[0] ?? null) : null;
  },
  toFormValues: (row) => ({ path: row.path, targetId: row.targetId }),
  create: (actor, input) => runCommand(actor, (ctx) => createAlias(ctx, input)),
  exportRow: (row) => ({
    ruta: row.path,
    ocasion: row.occasionTitle,
    creado: row.createdAt.toISOString(),
  }),
};
