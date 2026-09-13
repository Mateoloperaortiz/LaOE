import "server-only";
import { redirect } from "next/navigation";
import { committeeCapabilities } from "@/app/admin/comites/_kit/capacidades";
import { type Actor, getActor } from "@/modules/identity";
import { getOccasion, type OccasionListRow } from "@/modules/participation";

// Quién opera una ocasión (ADR-035 regla 15, ADR-058): ADMIN, el líder técnico del comité o quien
// tiene la capacidad OCCASIONS por su cargo en el término de la ocasión. La autorización vive en
// src/app porque compone identity, people y participation.

export async function canOperateOccasion(
  actor: Actor,
  occasion: { committeeId: string | null; termId: string },
): Promise<boolean> {
  if (actor.isAdmin) {
    return true;
  }
  if (occasion.committeeId === null) {
    return false;
  }
  const { capabilities } = await committeeCapabilities(
    actor,
    occasion.committeeId,
    occasion.termId,
  );
  return capabilities.has("OCCASIONS");
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
  if (!(await canOperateOccasion(actor, occasion))) {
    redirect("/app");
  }
  return { actor, occasion };
}
