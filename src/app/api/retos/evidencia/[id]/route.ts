import { getActor } from "@/modules/identity";
import { resolveEvidenceRedirect } from "@/modules/participation";

// Entrega de evidencias (ADR-067 regla 6): solo el autor o un ADMIN, solo en READY, con un 302
// prefirmado corto. Sin sesión, al ingreso y vuelve, como las páginas protegidas del proxy.

export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/;

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/retos/evidencia/[id]">,
) {
  const { id } = await params;
  if (!ID.test(id)) {
    return new Response("No existe", { status: 404 });
  }
  const actor = await getActor();
  if (!actor) {
    const next = `/api/retos/evidencia/${id}`;
    return new Response(null, {
      status: 302,
      headers: {
        location: `/ingresar?next=${encodeURIComponent(next)}`,
        "cache-control": "no-store",
      },
    });
  }
  const result = await resolveEvidenceRedirect(id, {
    personId: actor.personId,
    isAdmin: actor.isAdmin,
  });
  if (result.status === 404) {
    return new Response("No existe", { status: 404, headers: { "cache-control": "no-store" } });
  }
  if (result.status === 403) {
    return new Response("Solo el autor", {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { location: result.url, "cache-control": result.cacheControl },
  });
}
