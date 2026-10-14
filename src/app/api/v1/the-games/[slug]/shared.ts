import { getEnv } from "@/env";
import { corsHeaders } from "@/shared/lib/cors";

// Las cabeceras de las dos lecturas públicas de The Games para DÍAS, la vitrina y el recorrido de un
// equipo: el CORS de solo lectura (ADR-090 regla 4) y la caché de cada respuesta (regla 3). Son
// contrato de la API pública v1: las fija `tests/unit/the-games-public-headers.test.ts`.

/** La caché de cada respuesta: lo que existe se guarda 5 segundos, un 404 se guarda 30, un error no
 *  se guarda y la verificación previa vale un día. */
const CACHE = {
  found: "public, max-age=5, s-maxage=5, stale-while-revalidate=30",
  notFound: "public, max-age=30, s-maxage=30",
  unavailable: "no-store",
  preflight: "public, max-age=86400",
} as const;

export function showcaseHeaders(
  request: Request,
  response: keyof typeof CACHE,
): Record<string, string> {
  return {
    ...corsHeaders(getEnv().PUBLIC_API_ORIGINS, request.headers.get("origin")),
    "cache-control": CACHE[response],
  };
}
