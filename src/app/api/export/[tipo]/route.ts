import { actorContext } from "@/app/_lib/actor";
import { DOWNLOAD_SCREEN_PARAM, namedScreen, redirectFromDownload } from "@/app/_lib/download";
import { getActor, hasPermission, hasRecentStepUp } from "@/modules/identity";
import { recordExport } from "@/modules/system";
import { EXPORT_ROW_LIMIT, resolveFilters, toCsv } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { getResource } from "../../../admin/_kit/registry";

// Exportes CSV de los recursos del admin (06-mapa-del-sitio.md). Con datos personales: step-up y auditoría.
// Un exporte lleva como mucho `EXPORT_ROW_LIMIT` filas; si el listado tiene más, el archivo lo dice.

export const dynamic = "force-dynamic";

// Lo único que un enlace puede nombrar como su pantalla: una ruta del admin, sin `..`, sin `%` en la
// ruta y sin otro origen. Lo demás no se reconoce y se descarta.
const ADMIN_SCREEN = /^\/admin(\/[A-Za-z0-9_-]+)*(\?[A-Za-z0-9\-._~*=&%+]*)?$/;

/**
 * Pantalla que originó el exporte (ADR-113, regla 10): la que nombra el enlace, que es como se conoce
 * la de un recurso montado bajo otra ruta; si no nombra una del admin, el listado del recurso con la
 * misma búsqueda del exporte.
 */
function exportScreen(basePath: string, params: URLSearchParams): string {
  const query = new URLSearchParams(params);
  query.delete(DOWNLOAD_SCREEN_PARAM);
  return namedScreen(params, ADMIN_SCREEN, query.size ? `${basePath}?${query}` : basePath);
}

export async function GET(request: Request, { params }: RouteContext<"/api/export/[tipo]">) {
  const { tipo } = await params;
  const resource = getResource(tipo);
  if (!resource) {
    return new Response("No existe", { status: 404 });
  }
  const url = new URL(request.url);
  const screen = exportScreen(resource.basePath, url.searchParams);
  const actor = await getActor();
  if (!actor) {
    return redirectFromDownload("SIGN_IN", screen);
  }
  const boardAllowed = resource.access === "ADMIN_OR_BOARD" && hasPermission(actor, "BOARD");
  if (!actor.isAdmin && !boardAllowed) {
    return new Response("Solo ADMIN", { status: 403 });
  }
  if (resource.personalData && !hasRecentStepUp(actor)) {
    return redirectFromDownload("STEP_UP", screen);
  }
  const filters: Record<string, string> = {};
  for (const filter of await resolveFilters(resource)) {
    const value = url.searchParams.get(filter.key);
    if (value) {
      filters[filter.key] = value;
    }
  }
  const { rows, total: listed } = await resource.list({
    q: url.searchParams.get("q")?.trim() ?? "",
    page: 1,
    pageSize: EXPORT_ROW_LIMIT,
    filters,
    actor: { personId: actor.personId, isAdmin: actor.isAdmin },
  });
  const exported = rows.map((row) => resource.exportRow(row));
  const headers = exported[0] ? Object.keys(exported[0]) : [];
  // El listado dice cuántas filas hay; el exporte lleva como mucho las del tope (ADR-118 regla 13).
  const total = Math.max(listed, rows.length);
  if (resource.personalData) {
    await recordExport(await actorContext(actor), resource.key, { rows: rows.length, total });
  }
  // Recortado: la última fila lo dice, en la primera columna.
  const [firstColumn] = headers;
  const notice =
    total > rows.length && firstColumn !== undefined
      ? [{ [firstColumn]: t("T-3248", { n: rows.length, total }) }]
      : [];
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(headers, [...exported, ...notice]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${resource.key}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
