import { resolveMediaRedirect } from "@/modules/content";
import { getActor } from "@/modules/identity";

// Entrega de medios (ADR-022): valida estado y visibilidad y redirige a una URL prefirmada del bucket.
// Ningún byte atraviesa la app; la caché del 302 es menor que la vigencia de la firma.

export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/;

export async function GET(request: Request, { params }: RouteContext<"/api/media/[id]">) {
  const { id } = await params;
  if (!ID.test(id)) {
    return new Response("No existe", { status: 404 });
  }
  const raw = new URL(request.url).searchParams.get("w");
  const width = raw && /^\d{2,4}$/.test(raw) ? Number.parseInt(raw, 10) : null;
  const actor = await getActor();
  const result = await resolveMediaRedirect(id, width, { authenticated: actor !== null });
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
