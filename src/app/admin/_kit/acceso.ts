import { redirect } from "next/navigation";
import { type Actor, canOperate, hasPermission, requireActor } from "@/modules/identity";
import { type CommitteeRef, listCommitteesByIds } from "@/modules/people";
import { type GroupRef, listMyGroupRoles } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";

// Roles del área de administración (ADR-036 regla 10): ADMIN, líder de comité, junta y, derivados
// de los datos, líder o evaluador de un grupo de trabajo del término actual. `identity` no conoce
// los grupos, así que la composición vive aquí y no en un guard del módulo.

export interface AdminAreaRoles {
  actor: Actor;
  isAdmin: boolean;
  isBoard: boolean;
  ledCommittees: CommitteeRef[];
  ledGroups: GroupRef[];
  evaluatedGroups: GroupRef[];
  /** Alguna razón para estar en el admin. */
  any: boolean;
}

export async function adminAreaRoles(actor: Actor): Promise<AdminAreaRoles> {
  if (!canOperate(actor)) {
    return {
      actor,
      isAdmin: false,
      isBoard: false,
      ledCommittees: [],
      ledGroups: [],
      evaluatedGroups: [],
      any: false,
    };
  }
  const isAdmin = actor.isAdmin;
  const isBoard = hasPermission(actor, "BOARD");
  const ledCommittees = isAdmin
    ? []
    : await listCommitteesByIds(
        actor.permissions
          .filter((item) => item.code === "COMMITTEE_LEADER" && item.committeeId)
          .map((item) => item.committeeId as string),
      );
  const term = isAdmin ? null : await getCurrentTerm();
  const groups = term
    ? await listMyGroupRoles(actor.personId, term.id)
    : { leads: [], evaluates: [] };
  return {
    actor,
    isAdmin,
    isBoard,
    ledCommittees,
    ledGroups: groups.leads,
    evaluatedGroups: groups.evaluates,
    any:
      isAdmin ||
      isBoard ||
      ledCommittees.length > 0 ||
      groups.leads.length > 0 ||
      groups.evaluates.length > 0,
  };
}

/** Para el layout y las páginas del admin: quien no tiene ningún rol vuelve a Mi OE. */
export async function requireAdminAreaRoles(nextPath: string): Promise<AdminAreaRoles> {
  const actor = await requireActor(nextPath);
  const roles = await adminAreaRoles(actor);
  if (!roles.any) {
    redirect("/app");
  }
  return roles;
}
