import { namedScreen, redirectFromDownload } from "@/app/_lib/download";
import { resolveDocumentRedirect } from "@/modules/content";
import { getActor } from "@/modules/identity";

// "Abrir el PDF original" (ADR-034 regla 9): navegación de primer nivel que redirige a una URL
// prefirmada de 10 minutos del bucket privado; la CSP no la bloquea y ningún byte atraviesa la app.

export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/;

export async function GET(request: Request, { params }: RouteContext<"/api/documentos/[id]/pdf">) {
  const { id } = await params;
  if (!ID.test(id)) {
    return new Response("No existe", { status: 404 });
  }
  const url = new URL(request.url);
  const actor = await getActor();
  if (!actor) {
    // Sale del lector de Mi OE y del lector del admin de ese documento: vale el que nombre el
    // enlace y, si no nombra ninguno de los dos, el de Mi OE (ADR-113, regla 10).
    const readers = new RegExp(`^/(app/normativa|admin/documentos)/${id}$`);
    return redirectFromDownload(
      "SIGN_IN",
      namedScreen(url.searchParams, readers, `/app/normativa/${id}`),
    );
  }
  const result = await resolveDocumentRedirect(id, {
    authenticated: true,
    isAdmin: actor.isAdmin,
  });
  if (result.status === 404) {
    return new Response("No existe", { status: 404, headers: { "cache-control": "no-store" } });
  }
  if (result.status === 403) {
    return new Response("Solo con sesión", {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { location: result.url, "cache-control": result.cacheControl },
  });
}
