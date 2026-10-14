import { getShowcase } from "@/modules/competition";
import { logUnavailable } from "../unavailable";
import { showcaseHeaders } from "./shared";

// La vitrina de The Games para DÍAS (ADR-090): lectura pública, sin sesión ni datos personales, con
// caché corta y CORS de origen fijo. Una competencia en DRAFT, o que no existe, responde 404.

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{2,40}$/;

export async function GET(request: Request, { params }: RouteContext<"/api/v1/the-games/[slug]">) {
  const { slug } = await params;
  if (!SLUG.test(slug)) {
    return Response.json(
      { error: "no existe" },
      { status: 404, headers: showcaseHeaders(request, "notFound") },
    );
  }
  try {
    const showcase = await getShowcase(slug);
    if (!showcase) {
      return Response.json(
        { error: "no existe" },
        { status: 404, headers: showcaseHeaders(request, "notFound") },
      );
    }
    return Response.json(showcase, { headers: showcaseHeaders(request, "found") });
  } catch (error) {
    logUnavailable("GET /api/v1/the-games/[slug]", error);
    return Response.json(
      { error: "no disponible" },
      { status: 503, headers: showcaseHeaders(request, "unavailable") },
    );
  }
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: showcaseHeaders(request, "preflight") });
}
