import "server-only";
import { redirect } from "next/navigation";
import { getActor } from "@/modules/identity";
import { getGroup, listMyGroupRoles, type WorkGroupRow } from "@/modules/permanence";
import { clientIp } from "@/shared/lib/request";

// Guards de las páginas de permanencia (ADR-036 regla 10): el líder de un grupo lo opera y el
// evaluador de un grupo entra a la bandeja; ambos derivados de los datos, sin permiso técnico.

export interface OperatorContext {
  actor: { personId: string; ip: string | null };
  isAdmin: boolean;
  group: WorkGroupRow;
}

/** ADMIN o líder del grupo; el resto vuelve a Mi OE. */
export async function requireGroupOperator(
  groupId: string,
  returnTo: string,
): Promise<OperatorContext> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  const group = await getGroup(groupId);
  if (!group) {
    redirect("/admin");
  }
  if (!actor.isAdmin && group.leaderPersonId !== actor.personId) {
    redirect("/app");
  }
  return {
    actor: { personId: actor.personId, ip: await clientIp() },
    isAdmin: actor.isAdmin,
    group,
  };
}

export interface EvaluatorContext {
  actor: { personId: string; ip: string | null };
  isAdmin: boolean;
  /** Ids de los grupos que evalúa; null para ADMIN, que ve todos. */
  groupIds: string[] | null;
}

/** ADMIN o evaluador de al menos un grupo del término. */
export async function requireEvaluator(
  termId: string,
  returnTo: string,
): Promise<EvaluatorContext> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  const base = { personId: actor.personId, ip: await clientIp() };
  if (actor.isAdmin) {
    return { actor: base, isAdmin: true, groupIds: null };
  }
  const roles = await listMyGroupRoles(actor.personId, termId);
  if (roles.evaluates.length === 0) {
    redirect("/app");
  }
  return { actor: base, isAdmin: false, groupIds: roles.evaluates.map((group) => group.id) };
}
