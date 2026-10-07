import { getEnv } from "@/env";
import { single, withQuery } from "./search";

// Descargas que piden sesión o paso de seguridad (ADR-113, regla 10). El ingreso nunca vuelve a una
// ruta de API (`safeNextPath`), así que una ruta de descarga no se nombra a sí misma como destino:
// nombra la pantalla que la origina, con una marca para que esa pantalla avise que hay que repetirla.

/** Parámetro con el que un enlace de descarga nombra la pantalla donde está. */
export const DOWNLOAD_SCREEN_PARAM = "pantalla";

/** Enlace a una ruta de descarga que sale de más de una pantalla: nombra la que lo pinta. */
export function downloadHref(route: string, screen: string): string {
  return withQuery(route, { [DOWNLOAD_SCREEN_PARAM]: screen });
}

/**
 * La pantalla que nombra el enlace, solo si la ruta la reconoce como una de las que la originan;
 * cualquier otro valor se descarta y vale `fallback`.
 */
export function namedScreen(params: URLSearchParams, recognized: RegExp, fallback: string): string {
  const named = params.get(DOWNLOAD_SCREEN_PARAM) ?? "";
  return recognized.test(named) ? named : fallback;
}

const DOWNLOAD_MARK = "descarga";

const GATES = { SIGN_IN: "/ingresar", STEP_UP: "/ingresar/paso" } as const;

/**
 * Respuesta de una ruta de descarga que todavía no puede entregar: manda al ingreso (`SIGN_IN`) o al
 * paso de seguridad (`STEP_UP`) en el origen público, y de ahí a `screen` con la marca. Sin caché,
 * como toda respuesta de una ruta que entrega datos de una persona.
 */
export function redirectFromDownload(gate: keyof typeof GATES, screen: string): Response {
  const target = new URL(GATES[gate], getEnv().APP_URL);
  target.searchParams.set("next", withQuery(screen, { [DOWNLOAD_MARK]: "1" }));
  return new Response(null, {
    status: 302,
    headers: { location: target.href, "cache-control": "no-store" },
  });
}

/** La pantalla es el destino de vuelta de una descarga suya que no salió. */
export function isDownloadPending(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  return single(searchParams[DOWNLOAD_MARK]) === "1";
}
