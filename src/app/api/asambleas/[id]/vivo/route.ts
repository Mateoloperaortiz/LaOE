import { canOperateOccasion } from "@/app/_authz/occasion";
import { getActor } from "@/modules/identity";
import { getOccasion, listPolls, listPollsForMember } from "@/modules/participation";
import { sseResponse } from "@/shared/lib/sse";

// Las consultas de una asamblea en vivo (ADR-179, ADR-180): quien la opera ve todas; un miembro, las
// abiertas y cerradas con si ya votó. Las secretas abiertas nunca traen resultados.

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteContext<"/api/asambleas/[id]/vivo">) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "sin sesión" }, { status: 401 });
  }
  const occasion = await getOccasion(id);
  if (!occasion || occasion.kind !== "ASSEMBLY") {
    return Response.json({ error: "no existe" }, { status: 404 });
  }
  if (await canOperateOccasion(actor, occasion)) {
    return sseResponse(request, () => listPolls(id));
  }
  return sseResponse(request, async () => (await listPollsForMember(actor.personId, id)).polls);
}
