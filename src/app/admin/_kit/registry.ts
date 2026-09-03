import { announcementsResource, pagesResource } from "@/modules/content/admin";
import { editionsResource, eventsResource } from "@/modules/events/admin";
import { permissionsResource } from "@/modules/identity/admin";
import { termsResource } from "@/modules/participation/admin";
import { committeesResource } from "@/modules/people/admin";
import type { AnyResource } from "@/shared/admin-kit";

// Recursos administrables por clave (ADR-017). Cada módulo declara los suyos en su admin.ts.
const resources: Record<string, AnyResource> = {
  [committeesResource.key]: committeesResource as unknown as AnyResource,
  [termsResource.key]: termsResource as unknown as AnyResource,
  [permissionsResource.key]: permissionsResource as unknown as AnyResource,
  [pagesResource.key]: pagesResource as unknown as AnyResource,
  [announcementsResource.key]: announcementsResource as unknown as AnyResource,
  [eventsResource.key]: eventsResource as unknown as AnyResource,
  [editionsResource.key]: editionsResource as unknown as AnyResource,
};

export function getResource(key: string): AnyResource | null {
  return resources[key] ?? null;
}
