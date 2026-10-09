import { getEnv } from "@/env";
import { getTeamRoute } from "@/modules/competition";
import { corsHeaders } from "@/shared/lib/cors";
import { logUnavailable } from "../../../unavailable";

// El recorrido público de un equipo para DÍAS (ADR-097): sus paradas en las dos jornadas, con base,
// rival y resultado. Sin sesión ni datos personales, con la caché y el CORS de la vitrina (ADR-090).

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{2,40}$/;
const NUMBER = /^[1-9]\d?$/;

function headers(request: Request, cache: string): Record<string, string> {
  return {
    ...corsHeaders(getEnv().PUBLIC_API_ORIGINS, request.headers.get("origin")),
    "cache-control": cache,
  };
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/the-games/[slug]/equipos/[numero]">,
) {
  const { slug, numero } = await params;
  const notFound = () =>
    Response.json(
      { error: "no existe" },
      { status: 404, headers: headers(request, "public, max-age=30, s-maxage=30") },
    );
  if (!SLUG.test(slug) || !NUMBER.test(numero)) return notFound();
  try {
    const route = await getTeamRoute(slug, Number(numero));
    if (!route) return notFound();
    return Response.json(route, {
      headers: headers(request, "public, max-age=5, s-maxage=5, stale-while-revalidate=30"),
    });
  } catch (error) {
    logUnavailable("GET /api/v1/the-games/[slug]/equipos/[numero]", error);
    return Response.json(
      { error: "no disponible" },
      { status: 503, headers: headers(request, "no-store") },
    );
  }
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: headers(request, "public, max-age=86400") });
}
