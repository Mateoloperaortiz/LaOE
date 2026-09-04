import "server-only";
import { redirect } from "next/navigation";
import { type Actor, getActor, hasPermission } from "@/modules/identity";
import { getOccasion, type OccasionListRow } from "@/modules/participation";

// Quién opera una ocasión (ADR-035 regla 15): ADMIN, o el líder del comité de la ocasión. La
// autorización vive en src/app porque compone identity y participation.

export function canOperateOccasion(
  actor: Actor,
  occasion: { committeeId: string | null },
): boolean {
  return (
    actor.isAdmin ||
    (occasion.committeeId !== null &&
      hasPermission(actor, "COMMITTEE_LEADER", occasion.committeeId))
  );
}

/** Actor con sesión que puede operar la ocasión; si no, a entrar o a Mi OE. Null si la ocasión no existe. */
export async function requireOperator(
  occasionId: string,
  returnTo: string,
): Promise<{ actor: Actor; occasion: OccasionListRow } | null> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  const occasion = await getOccasion(occasionId);
  if (!occasion) {
    return null;
  }
  if (!canOperateOccasion(actor, occasion)) {
    redirect("/app");
  }
  return { actor, occasion };
}
