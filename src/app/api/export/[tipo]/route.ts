import { getActor, hasRecentStepUp } from "@/modules/identity";
import { recordExport } from "@/modules/system";
import { resolveFilters, toCsv } from "@/shared/admin-kit";
import { getResource } from "../../../admin/_kit/registry";

// Exportes CSV de los recursos del admin (06-mapa-del-sitio.md). Con datos personales: step-up y auditoría.

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteContext<"/api/export/[tipo]">) {
  const { tipo } = await params;
  const resource = getResource(tipo);
  if (!resource) {
    return new Response("No existe", { status: 404 });
  }
  const url = new URL(request.url);
  const here = encodeURIComponent(url.pathname + url.search);
  const actor = await getActor();
  if (!actor) {
    return Response.redirect(new URL(`/ingresar?next=${here}`, url), 302);
  }
  if (!actor.isAdmin) {
    return new Response("Solo ADMIN", { status: 403 });
  }
  if (resource.personalData && !hasRecentStepUp(actor)) {
    return Response.redirect(new URL(`/ingresar/paso?next=${here}`, url), 302);
  }
  const filters: Record<string, string> = {};
  for (const filter of await resolveFilters(resource)) {
    const value = url.searchParams.get(filter.key);
    if (value) {
      filters[filter.key] = value;
    }
  }
  const { rows } = await resource.list({
    q: url.searchParams.get("q")?.trim() ?? "",
    page: 1,
    pageSize: 10_000,
    filters,
    actor: { personId: actor.personId, isAdmin: actor.isAdmin },
  });
  const exported = rows.map((row) => resource.exportRow(row));
  const headers = exported[0] ? Object.keys(exported[0]) : [];
  if (resource.personalData) {
    await recordExport(actor.personId, resource.key, rows.length);
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(headers, exported), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${resource.key}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
