import { campaignsResource, messagesResource, templatesResource } from "@/modules/comms/admin";
import { announcementsResource, pagesResource } from "@/modules/content/admin";
import {
  callsResource,
  organizationsResource,
  pipelinesResource,
  tasksResource,
} from "@/modules/crm/admin";
import { editionsResource, eventsResource } from "@/modules/events/admin";
import { budgetsResource } from "@/modules/finance/admin";
import { countRegistrationsByEdition } from "@/modules/forms";
import { formsResource, registrationsResource, submissionsResource } from "@/modules/forms/admin";
import { permissionsResource } from "@/modules/identity/admin";
import {
  achievementsResource,
  aliasesResource,
  assembliesResource,
  challengeParticipationsResource,
  checkInsResource,
  ledgerResource,
  occasionsResource,
  rankingsResource,
} from "@/modules/participation/admin";
import { listCommitteesForSelection } from "@/modules/people";
import {
  committeesResource,
  peopleResource,
  preferentialScheduleResource,
  rolesResource,
  segmentsResource,
  tagsResource,
} from "@/modules/people/admin";
import { listGroupOptions, listGroupRefs } from "@/modules/permanence";
import { boardResource, complianceResource, workGroupsResource } from "@/modules/permanence/admin";
import { listAllTerms } from "@/modules/terms";
import { termsResource } from "@/modules/terms/admin";
import type { AnyResource } from "@/shared/admin-kit";
import { indexResources, type ResourceDefinition } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";

// La cartelera gana el comité de su cartelera interna (ADR-036): `content` no importa `people`, así que
// el selector de comités se compone aquí, en la capa de la app.
const carteleraResource = {
  ...announcementsResource,
  fields: async () => [
    ...(typeof announcementsResource.fields === "function"
      ? await announcementsResource.fields()
      : announcementsResource.fields),
    {
      name: "committeeId",
      label: t("T-838"),
      type: "select" as const,
      emptyOption: t("T-839"),
      options: (await listCommitteesForSelection()).map((item) => ({
        value: item.id,
        label: item.name,
      })),
    },
  ],
  toFormValues: (row: Parameters<typeof announcementsResource.toFormValues>[0]) => ({
    ...announcementsResource.toFormValues(row),
    committeeId: row.committeeId ?? "",
  }),
};

// Las ediciones ganan la columna de inscritos (ADR-037): `events` no importa `forms`, así que el conteo
// se compone aquí sobre el listado.
type EditionRowWithRegistrations = Parameters<typeof editionsResource.exportRow>[0] & {
  registrations: number;
};
export const edicionesResource = {
  ...editionsResource,
  columns: [
    ...editionsResource.columns,
    {
      key: "registrations",
      label: t("T-943"),
      render: (row: EditionRowWithRegistrations) => ({
        text: String(row.registrations),
        href: `/admin/eventos/${row.eventId}/ediciones/${row.id}/inscritos`,
      }),
    },
  ],
  list: async (params: Parameters<typeof editionsResource.list>[0]) => {
    const result = await editionsResource.list(params);
    const counts = await countRegistrationsByEdition(result.rows.map((row) => row.id));
    return {
      ...result,
      rows: result.rows.map((row) => ({ ...row, registrations: counts.get(row.id) ?? 0 })),
    };
  },
};

// Las convocatorias ganan el selector y la columna del grupo (ADR-037): `crm` no importa `permanence`,
// así que se componen aquí. La opción lleva el código del semestre para distinguir grupos homónimos.
type CallRowWithGroup = Parameters<typeof callsResource.exportRow>[0] & { groupName: string };
export const convocatoriasResource = {
  ...callsResource,
  fields: async () => {
    const [fields, groups, terms] = await Promise.all([
      typeof callsResource.fields === "function" ? callsResource.fields() : callsResource.fields,
      listGroupOptions(),
      listAllTerms(),
    ]);
    const termCode = new Map(terms.map((term) => [term.id, term.code]));
    const groupField = {
      name: "groupId",
      label: tList("T-1017")[1] ?? "",
      type: "select" as const,
      required: true,
      options: groups.map((group) => ({
        value: group.id,
        label: `${termCode.get(group.termId) ?? ""} · ${group.name}`,
      })),
    };
    return [fields[0], groupField, ...fields.slice(1)].filter(
      (field): field is NonNullable<typeof field> => field !== undefined,
    );
  },
  columns: [
    callsResource.columns[0],
    {
      key: "group",
      label: tList("T-1017")[1] ?? "",
      render: (row: CallRowWithGroup) => ({
        text: row.groupName,
        href: `/admin/permanencia/grupos/${row.groupId}`,
      }),
    },
    ...callsResource.columns.slice(1),
  ].filter((column): column is NonNullable<typeof column> => column !== undefined),
  list: async (params: Parameters<typeof callsResource.list>[0]) => {
    const result = await callsResource.list(params);
    const groups = await listGroupRefs(result.rows.map((row) => row.groupId));
    return {
      ...result,
      rows: result.rows.map((row) => ({ ...row, groupName: groups.get(row.groupId)?.name ?? "" })),
    };
  },
  exportRow: (row: CallRowWithGroup) => ({ ...callsResource.exportRow(row), grupo: row.groupName }),
};

// Recursos administrables por clave (ADR-017). Cada módulo declara los suyos en su admin.ts.

/**
 * El registro guarda recursos de filas distintas bajo un mismo tipo. `ResourceDefinition` es invariante
 * en su fila (la recibe `render` y la devuelve `list`), así que borrarla exige un cast: vive solo aquí,
 * y a cambio el compilador comprueba que lo que entra es un recurso bien formado (ADR-083).
 */
function erased<Row extends { id: string }, Input>(
  resource: ResourceDefinition<Row, Input>,
): AnyResource {
  return resource as unknown as AnyResource;
}

const registered: AnyResource[] = [
  erased(committeesResource),
  erased(peopleResource),
  erased(rolesResource),
  erased(tagsResource),
  erased(segmentsResource),
  erased(tasksResource),
  erased(organizationsResource),
  erased(pipelinesResource),
  erased(convocatoriasResource),
  erased(termsResource),
  erased(complianceResource),
  erased(workGroupsResource),
  erased(boardResource),
  erased(budgetsResource),
  erased(preferentialScheduleResource),
  erased(permissionsResource),
  erased(pagesResource),
  erased(carteleraResource),
  erased(eventsResource),
  erased(edicionesResource),
  erased(formsResource),
  erased(submissionsResource),
  erased(registrationsResource),
  erased(occasionsResource),
  erased(checkInsResource),
  erased(ledgerResource),
  erased(rankingsResource),
  erased(assembliesResource),
  erased(aliasesResource),
  erased(challengeParticipationsResource),
  erased(achievementsResource),
  erased(messagesResource),
  erased(templatesResource),
  erased(campaignsResource),
];

const resources = indexResources(registered);

export function getResource(key: string): AnyResource | null {
  return resources.get(key) ?? null;
}
