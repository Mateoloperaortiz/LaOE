import { redirect } from "next/navigation";
import { type Actor, canOperate, hasPermission, requireActor } from "@/modules/identity";
import {
  COMMITTEE_CAPABILITIES,
  type CommitteeCapability,
  type CommitteeRef,
  listCommitteesByIds,
  listMyCommitteeCapabilities,
} from "@/modules/people";
import { type GroupRef, listMyGroupRoles } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";

// Roles del área de administración (ADR-036 regla 10, ADR-058): ADMIN, líder de comité, junta y,
// derivados de los datos, líder o evaluador de un grupo de trabajo del término actual y la dirección
// de un comité por sus cargos. `identity` no conoce grupos ni cargos, así que la composición vive
// aquí y no en un guard del módulo.

export interface CommitteeAccessRef {
  committee: CommitteeRef;
  /** Unión de las capacidades: todas para el líder técnico, las de sus cargos para la dirección. */
  capabilities: CommitteeCapability[];
  isLeader: boolean;
}

export interface AdminAreaRoles {
  actor: Actor;
  isAdmin: boolean;
  isBoard: boolean;
  /** Comités con permiso técnico `COMMITTEE_LEADER`. */
  ledCommittees: CommitteeRef[];
  /** Comités donde el actor tiene alguna capacidad, por permiso o por cargo, en el orden del nombre. */
  committees: CommitteeAccessRef[];
  ledGroups: GroupRef[];
  evaluatedGroups: GroupRef[];
  /** Alguna razón para estar en el admin. */
  any: boolean;
}

export async function adminAreaRoles(actor: Actor): Promise<AdminAreaRoles> {
  // En licencia solo queda la dirección de su comité (Regl. art. 27 par. 6; ADR-060 regla 10): sin
  // permisos, junta ni grupos, que ADR-046 suspende.
  const onLeave = actor.membershipStatus === "ON_LEAVE";
  if (!canOperate(actor) && !onLeave) {
    return {
      actor,
      isAdmin: false,
      isBoard: false,
      ledCommittees: [],
      committees: [],
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
  const [groups, directed] = term
    ? await Promise.all([
        onLeave ? { leads: [], evaluates: [] } : listMyGroupRoles(actor.personId, term.id),
        listMyCommitteeCapabilities(actor.personId, term.id),
      ])
    : [{ leads: [], evaluates: [] }, []];
  const byId = new Map<string, CommitteeAccessRef>();
  for (const committee of ledCommittees) {
    byId.set(committee.id, {
      committee,
      capabilities: [...COMMITTEE_CAPABILITIES],
      isLeader: true,
    });
  }
  for (const item of directed) {
    if (!byId.has(item.committee.id)) {
      byId.set(item.committee.id, {
        committee: item.committee,
        capabilities: item.capabilities,
        isLeader: false,
      });
    }
  }
  const committees = [...byId.values()].sort((a, b) =>
    a.committee.name.localeCompare(b.committee.name),
  );
  return {
    actor,
    isAdmin,
    isBoard,
    ledCommittees,
    committees,
    ledGroups: groups.leads,
    evaluatedGroups: groups.evaluates,
    any:
      isAdmin ||
      isBoard ||
      committees.length > 0 ||
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
