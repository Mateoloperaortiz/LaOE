import { getEnv } from "@/env";
import { getShowcase } from "@/modules/competition";
import { corsHeaders } from "@/shared/lib/cors";
import { logUnavailable } from "../unavailable";

// La vitrina de The Games para DÍAS (ADR-090): lectura pública, sin sesión ni datos personales, con
// caché corta y CORS de origen fijo. Una competencia en DRAFT, o que no existe, responde 404.

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{2,40}$/;

function headers(request: Request, cache: string): Record<string, string> {
  return {
    ...corsHeaders(getEnv().PUBLIC_API_ORIGINS, request.headers.get("origin")),
    "cache-control": cache,
  };
}

export async function GET(request: Request, { params }: RouteContext<"/api/v1/the-games/[slug]">) {
  const { slug } = await params;
  if (!SLUG.test(slug)) {
    return Response.json(
      { error: "no existe" },
      { status: 404, headers: headers(request, "public, max-age=30, s-maxage=30") },
    );
  }
  try {
    const showcase = await getShowcase(slug);
    if (!showcase) {
      return Response.json(
        { error: "no existe" },
        { status: 404, headers: headers(request, "public, max-age=30, s-maxage=30") },
      );
    }
    return Response.json(showcase, {
      headers: headers(request, "public, max-age=5, s-maxage=5, stale-while-revalidate=30"),
    });
  } catch (error) {
    logUnavailable("GET /api/v1/the-games/[slug]", error);
    return Response.json(
      { error: "no disponible" },
      { status: 503, headers: headers(request, "no-store") },
    );
  }
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: headers(request, "public, max-age=86400") });
}
