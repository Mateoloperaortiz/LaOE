import { namedScreen, redirectFromDownload } from "@/app/_lib/download";
import { getActor } from "@/modules/identity";
import { resolveEvidenceRedirect } from "@/modules/participation";

// Entrega de evidencias (ADR-067 regla 6): solo el autor o un ADMIN, solo en READY, con un 302
// prefirmado corto. Sin sesión, al ingreso, y de ahí a la pantalla del admin que la enlaza
// (ADR-113, regla 10).

export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/;

// Las dos pantallas que enlazan una evidencia: la bandeja de revisión, con su búsqueda, y el detalle
// de un reto. Sin `..`, sin `%` en la ruta, sin fragmento y sin otro origen.
const REVIEW_SCREEN =
  /^\/admin\/gamificacion\/(revision|retos\/[a-z0-9]{10,40})(\?[A-Za-z0-9\-._~*=&%+]*)?$/;

export async function GET(request: Request, { params }: RouteContext<"/api/retos/evidencia/[id]">) {
  const { id } = await params;
  if (!ID.test(id)) {
    return new Response("No existe", { status: 404 });
  }
  const actor = await getActor();
  if (!actor) {
    return redirectFromDownload(
      "SIGN_IN",
      namedScreen(new URL(request.url).searchParams, REVIEW_SCREEN, "/admin/gamificacion/revision"),
    );
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
