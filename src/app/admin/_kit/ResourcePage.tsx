import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import {
  type AnyResource,
  Pagination,
  ResourceForm,
  ResourcePanel,
  ResourceSubmitButton,
  ResourceTable,
  ResourceToolbar,
  resolveFilters,
} from "@/shared/admin-kit";
import { t, tList } from "@/shared/copy";
import { rowActionAction, saveResourceAction } from "./actions";

const PAGE_SIZE = 25;
type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
function buildHref(basePath: string, params: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return query.size ? `${basePath}?${query}` : basePath;
}

type Props = {
  resource: AnyResource;
  searchParams: Search;
  /** Ruta donde se monta el recurso cuando no es su basePath (ediciones bajo un evento). */
  basePath?: string;
  /** Los filtros de contexto acotan listado, exportación y formulario. */
  fixedFilters?: Record<string, string>;
  title?: string;
};

// Página de recurso: listado y panel por URL, con los mismos comandos y permisos del módulo.
export async function ResourcePage({
  resource,
  searchParams,
  basePath = resource.basePath,
  fixedFilters = {},
  title,
}: Props) {
  const actor = await requireAdminActor(basePath);
  const q = single(searchParams.q).trim();
  const parsedPage = Number(single(searchParams.pagina) || "1");
  const page = Number.isSafeInteger(parsedPage) ? Math.max(1, parsedPage) : 1;
  const filterDefinitions = await resolveFilters(resource);
  const filters: Record<string, string> = {};
  for (const filter of filterDefinitions) {
    const value = single(searchParams[filter.key]);
    if (value && !Object.hasOwn(fixedFilters, filter.key)) filters[filter.key] = value;
  }
  const editId = single(searchParams.editar) || null;
  const creating = !editId && single(searchParams.nuevo) === "1";
  const saved = single(searchParams.guardado) === "1";
  const rowError = single(searchParams.error);
  if ((editId && !resource.update) || (creating && !resource.create)) notFound();

  const { rows, total } = await resource.list({
    q,
    page,
    pageSize: PAGE_SIZE,
    filters: { ...filters, ...fixedFilters },
    actor: { personId: actor.personId, isAdmin: actor.isAdmin },
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) {
    redirect(
      buildHref(basePath, {
        q,
        ...filters,
        pagina: totalPages > 1 ? String(totalPages) : "",
        editar: editId ?? "",
        nuevo: creating ? "1" : "",
        guardado: saved ? "1" : "",
        error: rowError,
      }),
    );
  }
  const listParams = { q, pagina: page > 1 ? String(page) : "", ...filters };
  const listHref = buildHref(basePath, listParams);
  const createHref = buildHref(basePath, { ...listParams, nuevo: "1" });
  const [previous, next] = tList("T-258") as [string, string];
  const filtered = Boolean(q || Object.keys(filters).length);

  let panel: React.ReactNode = null;
  if (creating || editId) {
    const row = editId ? await resource.get(editId) : null;
    if (editId && !row) notFound();
    if (resource.stepUp && !hasRecentStepUp(actor)) {
      const returnTo = buildHref(basePath, {
        ...listParams,
        ...(editId ? { editar: editId } : { nuevo: "1" }),
      });
      redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
    }
    const fields =
      typeof resource.fields === "function" ? await resource.fields() : resource.fields;
    panel = (
      <ResourcePanel
        key={`${resource.key}:${editId ?? "new"}`}
        title={`${editId ? t("T-252") : t("T-251")} · ${resource.names.singular}`}
        closeHref={listHref}
        closeLabel={t("T-291")}
      >
        <ResourceForm
          resourceKey={resource.key}
          id={row ? row.id : null}
          returnTo={listHref}
          fields={fields}
          initialValues={row ? resource.toFormValues(row) : { ...fixedFilters }}
          action={saveResourceAction}
          cancelHref={listHref}
          labels={{ save: t("T-253"), cancel: t("T-254") }}
        />
      </ResourcePanel>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="admin-resource-header flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display-lg">{title ?? resource.names.plural}</h1>
          <p className="mt-2 text-sm text-tinta-suave" aria-live="polite">
            {t("T-1423", { n: total })}
          </p>
        </div>
        {resource.create ? (
          <Link
            href={createHref}
            scroll={false}
            data-admin-panel-trigger
            className="boton-calido min-h-11 px-5 py-2 text-sm"
          >
            {t("T-251")}
          </Link>
        ) : null}
      </div>
      {saved ? (
        <output className="admin-feedback block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 text-sm font-semibold text-oe-navy">
          {t("T-259")}
        </output>
      ) : null}
      {rowError ? (
        <p
          role="alert"
          className="admin-feedback rounded-xl border border-oe-orange bg-fondo-suave px-4 py-3 text-sm font-semibold"
        >
          {rowError}
        </p>
      ) : null}
      <ResourceToolbar
        basePath={basePath}
        q={q}
        filters={filterDefinitions.filter((filter) => !Object.hasOwn(fixedFilters, filter.key))}
        filterValues={filters}
        labels={{ search: t("T-250"), create: t("T-251"), exportCsv: t("T-255"), all: t("T-1434") }}
        createHref={createHref}
        exportHref={buildHref(`/api/export/${resource.key}`, { q, ...filters, ...fixedFilters })}
        canCreate={false}
      />
      <ResourceTable
        columns={resource.columns}
        rows={rows}
        caption={title ?? resource.names.plural}
        editHref={
          resource.update
            ? (row) => buildHref(basePath, { ...listParams, editar: row.id })
            : undefined
        }
        labels={{
          edit: t("T-252"),
          empty: filtered ? t("T-256") : t("T-1424"),
          ...(!filtered && resource.create ? { emptyHelp: t("T-1425") } : {}),
        }}
        emptyAction={filtered ? { href: basePath, label: t("T-1422") } : undefined}
        rowActions={resource.rowActions ?? []}
        rowActionForm={(row, action) => (
          <form action={rowActionAction}>
            <input type="hidden" name="__resource" value={resource.key} />
            <input type="hidden" name="__action" value={action.key} />
            <input type="hidden" name="__id" value={row.id} />
            <input type="hidden" name="__returnTo" value={listHref} />
            <ResourceSubmitButton label={action.label} />
          </form>
        )}
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) =>
          buildHref(basePath, { ...listParams, pagina: target > 1 ? String(target) : "" })
        }
        labels={{ summary: t("T-257", { n: page, total: totalPages }), previous, next }}
      />
      {panel}
    </div>
  );
}
