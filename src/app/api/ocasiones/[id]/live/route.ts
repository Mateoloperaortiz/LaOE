import { canOperateOccasion } from "@/app/_authz/occasion";
import { getActor } from "@/modules/identity";
import { buildLiveSnapshot, getOccasion } from "@/modules/participation";

// Contador en vivo de la consola (ADR-035 regla 16): JSON sin caché para quien opera la ocasión.

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/api/ocasiones/[id]/live">) {
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
  const snapshot = await buildLiveSnapshot(occasion);
  return Response.json(snapshot, { headers: { "cache-control": "no-store" } });
}
