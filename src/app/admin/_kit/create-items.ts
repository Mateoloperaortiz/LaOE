import type { AdminAreaRoles } from "@/app/_authz/admin-area";
import { t } from "@/shared/copy";
import { listResources } from "./registry";

// Lo que el actor puede crear (ADR-167 regla 2): el menú «Crear» de la barra superior y las acciones
// de ⌘K salen de aquí. Cada entrada lleva a la pantalla que ya hace la tarea, con su formulario abierto,
// y esa pantalla vuelve a exigir su permiso.
// - ADMIN: cada recurso del kit con alta, una vez por pantalla (las ediciones se crean dentro de su
//   evento, que comparte la ruta base), y el enlace de activación.
// - La dirección de un comité con la capacidad de ocasiones: una ocasión de su comité.
// - La junta: el enlace de activación.

export type CreateItem = { href: string; label: string };

type Roles = Pick<AdminAreaRoles, "isAdmin" | "isBoard" | "committees">;

export function createItemsFor(roles: Roles): CreateItem[] {
  const items: CreateItem[] = [];
  if (roles.isAdmin) {
    const seen = new Set<string>();
    const fromKit: CreateItem[] = [];
    for (const resource of listResources()) {
      if (!resource.create || seen.has(resource.basePath)) continue;
      seen.add(resource.basePath);
      fromKit.push({ href: `${resource.basePath}?nuevo=1`, label: resource.names.singular });
    }
    items.push(...fromKit.sort((a, b) => a.label.localeCompare(b.label, "es")));
  } else {
    for (const item of roles.committees) {
      if (!item.capabilities.includes("OCCASIONS")) continue;
      items.push({
        href: `/admin/comites/${item.committee.slug}?area=actividades&accion=nueva`,
        label: t("T-4902", { comité: item.committee.name }),
      });
    }
  }
  if (roles.isAdmin || roles.isBoard) {
    items.push({ href: "/admin/personas/activacion", label: t("T-4900") });
  }
  return items;
}
