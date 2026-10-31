import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import {
  getRequest,
  getRequestByTask,
  listRequests,
  REQUEST_KINDS,
  REQUEST_STATUSES,
} from "@/modules/crm";
import { requireAdminActor } from "@/modules/identity";
import { getCurrentTerm, nextTermCode } from "@/modules/terms";
import { Pagination } from "@/shared/admin-kit";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { PanelSolicitud } from "./_ui/PanelSolicitud";

// Bandeja de solicitudes (06-mapa-del-sitio.md, ADR-037 regla 9): filtros por estado y tipo y el panel
// de decisión por URL (?solicitud=<id>, o ?tarea=<id> desde la tarea).

export const metadata: Metadata = { title: t("T-997") };

const PAGE_SIZE = 25;
const ID = /^[a-z0-9-]{10,40}$/;

type Search = Record<string, string | string[] | undefined>;

function buildHref(params: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const text = query.toString();
  return text ? `/admin/solicitudes?${text}` : "/admin/solicitudes";
}

export default async function Page({ searchParams }: PageProps<"/admin/solicitudes">) {
  await requireAdminActor("/admin/solicitudes");
  const search: Search = await searchParams;
  const estado = single(search.estado) || "PENDING";
  const tipo = single(search.tipo);
  const page = Math.max(1, Number.parseInt(single(search.pagina) || "1", 10) || 1);
  const solicitudId = single(search.solicitud);
  const tareaId = single(search.tarea);
  const error = single(search.error);
  const decidida = single(search.decidida);
  const [result, selected, term] = await Promise.all([
    listRequests({
      status: estado === "ALL" ? undefined : estado,
      kind: tipo || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    solicitudId && ID.test(solicitudId)
      ? getRequest(solicitudId)
      : tareaId && ID.test(tareaId)
        ? getRequestByTask(tareaId)
        : Promise.resolve(null),
    getCurrentTerm(),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  if ((solicitudId || tareaId) && !selected) notFound();
  if (page > totalPages) {
    redirect(
      buildHref({
        estado,
        tipo,
        pagina: totalPages > 1 ? String(totalPages) : "",
        solicitud: solicitudId,
        tarea: tareaId,
      }),
    );
  }
  const listParams = { estado, tipo, pagina: page > 1 ? String(page) : "" };
  const listHref = buildHref(listParams);
  const columns = tList("T-998");
  const statusValues = [...REQUEST_STATUSES, "ALL"] as const;
  const statusFilters = tLabels("T-999", statusValues);
  const kindFilters = tLabels("T-1057", REQUEST_KINDS);
  const [previous, next] = tList("T-258");
  const decidedLabel = decidida
    ? t("T-1008", { estado: (tList("T-876")[decidida === "APPROVED" ? 1 : 2] ?? "").toLowerCase() })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display-lg">{t("T-997")}</h1>
      {decidedLabel ? (
        <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {decidedLabel}
        </output>
      ) : null}
      {error && !selected ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-4 rounded-xl border border-borde bg-fondo p-4">
        <nav aria-label={columns[4] ?? ""} className="flex flex-wrap gap-2">
          {statusValues.map((value) => (
            <Link
              key={value}
              href={buildHref({ ...listParams, estado: value, pagina: "" })}
              aria-current={estado === value ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${estado === value ? "bg-oe-navy text-oe-paper" : "bg-fondo-suave"}`}
            >
              {statusFilters[value]}
            </Link>
          ))}
        </nav>
        <nav aria-label={columns[1] ?? ""} className="flex flex-wrap gap-2">
          <Link
            href={buildHref({ ...listParams, tipo: "", pagina: "" })}
            aria-current={tipo === "" ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${tipo === "" ? "bg-fondo-suave font-semibold" : ""}`}
          >
            {tList("T-999")[4]}
          </Link>
          {REQUEST_KINDS.map((value) => (
            <Link
              key={value}
              href={buildHref({ ...listParams, tipo: value, pagina: "" })}
              aria-current={tipo === value ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm ${tipo === value ? "bg-fondo-suave font-semibold" : ""}`}
            >
              {kindFilters[value]}
            </Link>
          ))}
        </nav>
      </div>
      {result.rows.length === 0 ? (
        <p className="text-tinta-suave">{t("T-1000")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-data-table w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-borde">
                {columns.map((column) => (
                  <th scope="col" key={column} className="eyebrow py-2 pr-4 text-xs">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} className="border-b border-borde">
                  <td data-label={columns[0]} className="py-2 pr-4 font-semibold">
                    <Link
                      href={buildHref({ ...listParams, solicitud: row.id })}
                      className="underline"
                    >
                      {row.personName}
                    </Link>
                  </td>
                  <td data-label={columns[1]} className="py-2 pr-4">
                    {row.kindLabel}
                  </td>
                  <td data-label={columns[2]} className="py-2 pr-4">
                    {row.detail}
                  </td>
                  <td data-label={columns[3]} className="py-2 pr-4">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td data-label={columns[4]} className="py-2 pr-4">
                    <Insignia
                      fondo={
                        row.status === "PENDING"
                          ? "sky"
                          : row.status === "APPROVED"
                            ? "amarillo"
                            : row.status === "REJECTED"
                              ? "naranja"
                              : "paper"
                      }
                    >
                      {row.statusLabel}
                    </Insignia>
                  </td>
                  <td data-label={columns[5]} className="py-2 pr-4">
                    {row.decidedByName ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) => buildHref({ ...listParams, pagina: String(target) })}
        labels={{ summary: t("T-257", { n: page, total: totalPages }), previous, next }}
      />
      {selected ? (
        <PanelSolicitud
          request={selected}
          closeHref={listHref}
          returnTo={buildHref({ ...listParams, solicitud: selected.id })}
          error={error}
          nextTermCode={term ? nextTermCode(term.code) : null}
        />
      ) : null}
    </div>
  );
}
