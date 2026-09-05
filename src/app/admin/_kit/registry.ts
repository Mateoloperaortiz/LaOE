import { announcementsResource, pagesResource } from "@/modules/content/admin";
import { tasksResource } from "@/modules/crm/admin";
import { editionsResource, eventsResource } from "@/modules/events/admin";
import { countRegistrationsByEdition } from "@/modules/forms";
import { formsResource, registrationsResource, submissionsResource } from "@/modules/forms/admin";
import { permissionsResource } from "@/modules/identity/admin";
import {
  aliasesResource,
  assembliesResource,
  checkInsResource,
  ledgerResource,
  occasionsResource,
  rankingsResource,
} from "@/modules/participation/admin";
import { listAllCommittees } from "@/modules/people";
import {
  committeesResource,
  peopleResource,
  rolesResource,
  segmentsResource,
  tagsResource,
} from "@/modules/people/admin";
import { boardResource, complianceResource, workGroupsResource } from "@/modules/permanence/admin";
import { termsResource } from "@/modules/terms/admin";
import type { AnyResource } from "@/shared/admin-kit";
import { t } from "@/shared/copy";

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
      options: (await listAllCommittees()).map((item) => ({ value: item.id, label: item.name })),
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

// Recursos administrables por clave (ADR-017). Cada módulo declara los suyos en su admin.ts.
const resources: Record<string, AnyResource> = {
  [committeesResource.key]: committeesResource as unknown as AnyResource,
  [peopleResource.key]: peopleResource as unknown as AnyResource,
  [rolesResource.key]: rolesResource as unknown as AnyResource,
  [tagsResource.key]: tagsResource as unknown as AnyResource,
  [segmentsResource.key]: segmentsResource as unknown as AnyResource,
  [tasksResource.key]: tasksResource as unknown as AnyResource,
  [termsResource.key]: termsResource as unknown as AnyResource,
  [complianceResource.key]: complianceResource as unknown as AnyResource,
  [workGroupsResource.key]: workGroupsResource as unknown as AnyResource,
  [boardResource.key]: boardResource as unknown as AnyResource,
  [permissionsResource.key]: permissionsResource as unknown as AnyResource,
  [pagesResource.key]: pagesResource as unknown as AnyResource,
  [announcementsResource.key]: carteleraResource as unknown as AnyResource,
  [eventsResource.key]: eventsResource as unknown as AnyResource,
  [editionsResource.key]: edicionesResource as unknown as AnyResource,
  [formsResource.key]: formsResource as unknown as AnyResource,
  [submissionsResource.key]: submissionsResource as unknown as AnyResource,
  [registrationsResource.key]: registrationsResource as unknown as AnyResource,
  [occasionsResource.key]: occasionsResource as unknown as AnyResource,
  [checkInsResource.key]: checkInsResource as unknown as AnyResource,
  [ledgerResource.key]: ledgerResource as unknown as AnyResource,
  [rankingsResource.key]: rankingsResource as unknown as AnyResource,
  [assembliesResource.key]: assembliesResource as unknown as AnyResource,
  [aliasesResource.key]: aliasesResource as unknown as AnyResource,
};

export function getResource(key: string): AnyResource | null {
  return resources[key] ?? null;
}
