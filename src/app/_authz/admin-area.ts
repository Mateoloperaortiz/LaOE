import { redirect } from "next/navigation";
import { listMyCompetitionRoles, type MyCompetitionRole } from "@/modules/competition";
import { type Actor, canOperate, hasPermission, requireActor } from "@/modules/identity";
import {
  COMMITTEE_CAPABILITIES,
  type CommitteeCapability,
  type CommitteeRef,
  hasVpAdminInTerm,
  listCommitteesByIds,
  listMyCommitteeCapabilities,
} from "@/modules/people";
import { type GroupRef, listMyGroupRoles } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";

// Roles del área de administración (ADR-036 regla 10, ADR-058, ADR-089): ADMIN, líder de comité, junta
// y, derivados de los datos, líder o evaluador de un grupo de trabajo del término actual, la dirección
// de un comité por sus cargos y el personal de The Games (Dirección, operadores y jueces). `identity` no conoce grupos ni cargos, así que la composición vive
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
  /** VP administrativa vigente: acceso limitado al inventario. */
  managesInventory: boolean;
  /** Semestre ya consultado para componer navegación sin repetir la lectura. */
  currentTermId: string | null;
  /** Comités con permiso técnico `COMMITTEE_LEADER`. */
  ledCommittees: CommitteeRef[];
  /** Comités donde el actor tiene alguna capacidad, por permiso o por cargo, en el orden del nombre. */
  committees: CommitteeAccessRef[];
  ledGroups: GroupRef[];
  evaluatedGroups: GroupRef[];
  /** Competencias de The Games donde opera o juzga (ADR-089 regla 10). */
  competitions: MyCompetitionRole[];
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
      managesInventory: false,
      currentTermId: null,
      ledCommittees: [],
      committees: [],
      ledGroups: [],
      evaluatedGroups: [],
      competitions: [],
      any: false,
    };
  }
  const isAdmin = actor.isAdmin;
  const isBoard = hasPermission(actor, "BOARD");
  const term = await getCurrentTerm();
  const managesInventory =
    !onLeave && term !== null && (await hasVpAdminInTerm(actor.personId, term.id));
  const ledCommittees = isAdmin
    ? []
    : await listCommitteesByIds(
        actor.permissions
          .filter((item) => item.code === "COMMITTEE_LEADER" && item.committeeId)
          .map((item) => item.committeeId as string),
      );
  const [groups, directed] =
    !isAdmin && term
      ? await Promise.all([
          onLeave ? { leads: [], evaluates: [] } : listMyGroupRoles(actor.personId, term.id),
          listMyCommitteeCapabilities(actor.personId, term.id),
        ])
      : [{ leads: [], evaluates: [] }, []];
  // ADMIN ya ve todo; en licencia no se opera The Games (ADR-089 regla 10).
  const competitions = isAdmin || onLeave ? [] : await listMyCompetitionRoles(actor);
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
    managesInventory,
    currentTermId: term?.id ?? null,
    ledCommittees,
    committees,
    ledGroups: groups.leads,
    evaluatedGroups: groups.evaluates,
    competitions,
    any:
      isAdmin ||
      isBoard ||
      managesInventory ||
      committees.length > 0 ||
      groups.leads.length > 0 ||
      groups.evaluates.length > 0 ||
      competitions.length > 0,
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
