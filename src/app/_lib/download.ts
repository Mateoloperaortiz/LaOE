import { getEnv } from "@/env";
import { single, withQuery } from "./search";

// Descargas que piden sesión o paso de seguridad (ADR-113, regla 10). El ingreso nunca vuelve a una
// ruta de API (`safeNextPath`), así que una ruta de descarga no se nombra a sí misma como destino:
// nombra la pantalla que la origina, con una marca para que esa pantalla avise que hay que repetirla.

/** Parámetro con el que un enlace de descarga nombra la pantalla donde está. */
export const DOWNLOAD_SCREEN_PARAM = "pantalla";

const DOWNLOAD_MARK = "descarga";

const GATES = { SIGN_IN: "/ingresar", STEP_UP: "/ingresar/paso" } as const;

/**
 * Respuesta de una ruta de descarga que todavía no puede entregar: manda al ingreso (`SIGN_IN`) o al
 * paso de seguridad (`STEP_UP`) en el origen público, y de ahí a `screen` con la marca.
 */
export function redirectFromDownload(gate: keyof typeof GATES, screen: string): Response {
  const target = new URL(GATES[gate], getEnv().APP_URL);
  target.searchParams.set("next", withQuery(screen, { [DOWNLOAD_MARK]: "1" }));
  return Response.redirect(target, 302);
}

/** La pantalla es el destino de vuelta de una descarga suya que no salió. */
export function isDownloadPending(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  return single(searchParams[DOWNLOAD_MARK]) === "1";
}
