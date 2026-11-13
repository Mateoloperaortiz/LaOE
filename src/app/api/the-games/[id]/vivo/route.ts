import { competitionStaffFor } from "@/app/_authz/competition";
import { listStandings } from "@/modules/competition";
import { getActor } from "@/modules/identity";
import { sseResponse } from "@/shared/lib/sse";

// La tabla general de The Games en vivo (ADR-179, ADR-181): para el personal de la competencia, que la
// lleva a la sala de operación y a la pantalla de presentación.

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteContext<"/api/the-games/[id]/vivo">) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "sin sesión" }, { status: 401 });
  }
  const found = await competitionStaffFor(actor, id);
  if (!found) {
    return Response.json({ error: "no existe" }, { status: 404 });
  }
  if (!found.staff) {
    return Response.json({ error: "sin permiso" }, { status: 403 });
  }
  return sseResponse(request, async () => (await listStandings(id)).overall, { intervalMs: 3_000 });
}
