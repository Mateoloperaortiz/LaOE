import { requireAdminActor } from "@/modules/identity";
import {
  type AnyResource,
  Pagination,
  ResourceForm,
  ResourcePanel,
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
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const text = query.toString();
  return text ? `${basePath}?${text}` : basePath;
}

type Props = {
  resource: AnyResource;
  searchParams: Search;
  /** Ruta donde se monta el recurso cuando no es su `basePath` (ediciones bajo un evento). */
  basePath?: string;
  /** Filtros que fija la ruta, no la barra: acotan el listado y prellenan el formulario de creación. */
  fixedFilters?: Record<string, string>;
  /** Título de la página cuando el contexto lo pide ("Ediciones · Días EAFIT"). */
  title?: string;
};

// Página genérica de un recurso: listado, filtros, paginación y panel lateral por URL (ADR-017).
export async function ResourcePage({
  resource,
  searchParams,
  basePath = resource.basePath,
  fixedFilters = {},
  title,
}: Props) {
  const actor = await requireAdminActor(basePath);
  const q = single(searchParams.q).trim();
  const page = Math.max(1, Number.parseInt(single(searchParams.pagina) || "1", 10) || 1);
  const filterDefinitions = await resolveFilters(resource);
  const filters: Record<string, string> = {};
  for (const filter of filterDefinitions) {
    const value = single(searchParams[filter.key]);
    if (value) {
      filters[filter.key] = value;
    }
  }
  const editId = single(searchParams.editar) || null;
  const creating = single(searchParams.nuevo) === "1";
  const saved = single(searchParams.guardado) === "1";
  const rowError = single(searchParams.error);

  const { rows, total } = await resource.list({
    q,
    page,
    pageSize: PAGE_SIZE,
    filters: { ...filters, ...fixedFilters },
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const listParams = { q, pagina: page > 1 ? String(page) : "", ...filters };
  const listHref = buildHref(basePath, listParams);
  const [previous, next] = tList("T-258") as [string, string];

  let panel: React.ReactNode = null;
  if (creating || editId) {
    const fields =
      typeof resource.fields === "function" ? await resource.fields() : resource.fields;
    const row = editId ? await resource.get(editId) : null;
    const initialValues = row ? resource.toFormValues(row) : { ...fixedFilters };
    panel = (
      <ResourcePanel
        title={
          editId
            ? `${t("T-252")} · ${resource.names.singular}`
            : `${t("T-251")} · ${resource.names.singular}`
        }
        closeHref={listHref}
        closeLabel={t("T-291")}
      >
        <ResourceForm
          resourceKey={resource.key}
          id={row ? row.id : null}
          returnTo={listHref}
          fields={fields}
          initialValues={initialValues}
          action={saveResourceAction}
          cancelHref={listHref}
          labels={{ save: t("T-253"), cancel: t("T-254") }}
        />
      </ResourcePanel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display-lg">{title ?? resource.names.plural}</h1>
      {saved ? (
        <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {t("T-259")}
        </output>
      ) : null}
      {rowError ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
        >
          {rowError}
        </p>
      ) : null}
      <ResourceToolbar
        basePath={basePath}
        q={q}
        filters={filterDefinitions}
        filterValues={filters}
        labels={{ search: t("T-250"), create: t("T-251"), exportCsv: t("T-255"), all: "—" }}
        createHref={buildHref(basePath, { ...listParams, nuevo: "1" })}
        exportHref={buildHref(`/api/export/${resource.key}`, { q, ...filters, ...fixedFilters })}
        canCreate={resource.create !== undefined && actor.isAdmin}
      />
      <ResourceTable
        columns={resource.columns}
        rows={rows}
        editHref={
          resource.update
            ? (row) => buildHref(basePath, { ...listParams, editar: row.id })
            : undefined
        }
        labels={{ edit: t("T-252"), empty: t("T-256") }}
        rowActions={resource.rowActions ?? []}
        rowActionForm={(row, action) => (
          <form action={rowActionAction}>
            <input type="hidden" name="__resource" value={resource.key} />
            <input type="hidden" name="__action" value={action.key} />
            <input type="hidden" name="__id" value={row.id} />
            <input type="hidden" name="__returnTo" value={listHref} />
            <button type="submit" className="boton-secundario min-h-9 px-4 py-1 text-sm">
              {action.label}
            </button>
          </form>
        )}
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) => buildHref(basePath, { ...listParams, pagina: String(target) })}
        labels={{ summary: t("T-257", { n: page, total: totalPages }), previous, next }}
      />
      {panel}
    </div>
  );
}
