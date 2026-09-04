import "server-only";
import { redirect } from "next/navigation";
import { getActor } from "@/modules/identity";
import { getGroup, type WorkGroupRow } from "@/modules/permanence";
import { clientIp } from "@/shared/lib/request";

// Guards de las páginas de permanencia (ADR-036 regla 10): el líder de un grupo lo opera (derivado de
// los datos, sin permiso técnico); el guard del evaluador llega con la bandeja (F4-T5).

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
