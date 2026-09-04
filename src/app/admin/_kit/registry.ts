import { announcementsResource, pagesResource } from "@/modules/content/admin";
import { tasksResource } from "@/modules/crm/admin";
import { editionsResource, eventsResource } from "@/modules/events/admin";
import { permissionsResource } from "@/modules/identity/admin";
import {
  aliasesResource,
  assembliesResource,
  checkInsResource,
  ledgerResource,
  occasionsResource,
  rankingsResource,
} from "@/modules/participation/admin";
import {
  committeesResource,
  peopleResource,
  rolesResource,
  segmentsResource,
  tagsResource,
} from "@/modules/people/admin";
import { complianceResource, workGroupsResource } from "@/modules/permanence/admin";
import { termsResource } from "@/modules/terms/admin";
import type { AnyResource } from "@/shared/admin-kit";

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
  [permissionsResource.key]: permissionsResource as unknown as AnyResource,
  [pagesResource.key]: pagesResource as unknown as AnyResource,
  [announcementsResource.key]: announcementsResource as unknown as AnyResource,
  [eventsResource.key]: eventsResource as unknown as AnyResource,
  [editionsResource.key]: editionsResource as unknown as AnyResource,
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
