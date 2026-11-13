import { canOperateOccasion } from "@/app/_authz/occasion";
import { getActor } from "@/modules/identity";
import { buildLiveSnapshot, getOccasion } from "@/modules/participation";
import { sseResponse } from "@/shared/lib/sse";

// La consola en vivo por SSE (ADR-179): el mismo estado de `/live`, mandado cuando cambia. Exige el
// permiso de operar la ocasión al abrir; si la ocasión deja de existir, el flujo se cierra.

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteContext<"/api/ocasiones/[id]/vivo">) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "sin sesión" }, { status: 401 });
  }
  const occasion = await getOccasion(id);
  if (!occasion) {
    return Response.json({ error: "no existe" }, { status: 404 });
  }
  if (!(await canOperateOccasion(actor, occasion))) {
    return Response.json({ error: "sin permiso" }, { status: 403 });
  }
  return sseResponse(request, async () => {
    const current = await getOccasion(id);
    if (!current) throw new Error("la ocasión ya no existe");
    return buildLiveSnapshot(current);
  });
}
