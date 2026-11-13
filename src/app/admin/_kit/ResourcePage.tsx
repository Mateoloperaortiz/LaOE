import { notFound, redirect } from "next/navigation";
import { DOWNLOAD_SCREEN_PARAM } from "@/app/_lib/download";
import { single } from "@/app/_lib/search";
import { exportLimitNotice } from "@/app/admin/_kit/export-limit-notice";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { listSavedViews, savedViewQuery } from "@/modules/system";
import {
  type AnyResource,
  buildHref,
  COLUMNS_PARAM,
  isInlineField,
  Pagination,
  ResourceForm,
  ResourcePanel,
  ResourceSubmitButton,
  ResourceTable,
  ResourceToolbar,
  resolveFilters,
  visibleColumnKeys,
} from "@/shared/admin-kit";
import { InlineEditCell } from "@/shared/admin-kit/InlineEditCell";
import { t, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { BatchBar } from "@/shared/ui/BatchBar";
import { ListShortcuts } from "@/shared/ui/ListShortcuts";
import {
  batchRowAction,
  deleteViewAction,
  inlineEditAction,
  rowActionAction,
  saveResourceAction,
  saveViewAction,
} from "./actions";
import { DownloadNotice } from "./DownloadNotice";

const PAGE_SIZE = 25;
type Search = Record<string, string | string[] | undefined>;

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
  // Columnas a elección (ADR-167 regla 4): viajan en la dirección y se conservan al paginar y editar.
  const visible = visibleColumnKeys(
    searchParams[COLUMNS_PARAM],
    resource.columns.map((column) => column.key),
  );
  const columns = visible
    ? resource.columns.filter((column) => visible.includes(column.key))
    : resource.columns;
  const columnsParam = visible ? visible.join(",") : "";
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
        [COLUMNS_PARAM]: columnsParam,
        pagina: totalPages > 1 ? String(totalPages) : "",
        editar: editId ?? "",
        nuevo: creating ? "1" : "",
        guardado: saved ? "1" : "",
        error: rowError,
      }),
    );
  }
  const listParams = {
    q,
    pagina: page > 1 ? String(page) : "",
    ...filters,
    [COLUMNS_PARAM]: columnsParam,
  };
  const listHref = buildHref(basePath, listParams);
  const createHref = buildHref(basePath, { ...listParams, nuevo: "1" });
  const [previous, next] = tList("T-258");
  const filtered = Boolean(q || Object.keys(filters).length);

  // Edición en línea (ADR-167 regla 5): solo ADMIN, que es quien guarda por el kit.
  const inlineFields =
    actor.isAdmin && resource.update && resource.inlineEdit
      ? (typeof resource.fields === "function" ? await resource.fields() : resource.fields).filter(
          isInlineField,
        )
      : [];

  // Vistas guardadas (ADR-170 regla 1): las propias y las compartidas de esta tabla.
  const viewQuery = savedViewQuery(new URLSearchParams(listParams).toString());
  const savedViews = await listSavedViews(actor.personId, basePath);
  const viewSaved = single(searchParams.vista) === "guardada";
  // Lote con vista previa (ADR-170 regla 3): solo ADMIN, que es quien corre acciones de fila.
  const batchActions = (resource.rowActions ?? []).filter(
    (action) => resource.batchActions?.includes(action.key) && resource.runRowAction,
  );
  const canBatch = actor.isAdmin && batchActions.length > 0;
  const batchForm = `lote-${resource.key}`;
  const batchKey = single(searchParams.lote);
  const batchAction = canBatch ? batchActions.find((item) => item.key === batchKey) : undefined;
  const batchDone = single(searchParams.lote_hechas);
  const batchFailed = single(searchParams.lote_fallidas);
  const [seleccionarTodas, accionLote, verVistaPrevia] = tList("T-4935");
  const [uno, varios] = tList("T-4937");

  let panel: React.ReactNode = null;
  if (batchAction) {
    const ids = [
      ...new Set(
        (Array.isArray(searchParams.ids) ? searchParams.ids : [searchParams.ids ?? ""])
          .flatMap((item) => item.split(","))
          .filter(Boolean),
      ),
    ].slice(0, 100);
    const found = (await Promise.all(ids.map((id) => resource.get(id)))).filter(
      (row) => row !== null,
    );
    const applies = found.filter((row) => batchAction.applies?.(row) ?? true);
    const [confirmar, cancelar, noAplica] = tList("T-4940");
    const nameOf = (row: { id: string }) => {
      const value = resource.columns[0]?.render(row);
      return value === null || value === undefined
        ? row.id
        : typeof value === "object"
          ? value.text
          : String(value);
    };
    panel = (
      <ResourcePanel
        key={`${resource.key}:lote`}
        title={t("T-4938", { acción: batchAction.label })}
        closeHref={listHref}
        closeLabel={t("T-291")}
      >
        <div className="flex flex-col gap-4">
          <p className="font-semibold">{t("T-4939", { n: applies.length, total: found.length })}</p>
          <ul className="m-0 flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0 text-sm">
            {found.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span>{nameOf(row)}</span>
                {applies.includes(row) ? null : (
                  <span className="text-tinta-secundaria">{noAplica}</span>
                )}
              </li>
            ))}
          </ul>
          <form action={batchRowAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="__resource" value={resource.key} />
            <input type="hidden" name="__action" value={batchAction.key} />
            <input type="hidden" name="__returnTo" value={listHref} />
            {applies.map((row) => (
              <input key={row.id} type="hidden" name="ids" value={row.id} />
            ))}
            <button
              type="submit"
              disabled={applies.length === 0}
              className="boton-primario min-h-11 px-4 py-2 text-sm"
            >
              {confirmar}
            </button>
            <Link href={listHref} className="boton-secundario min-h-11 px-4 py-2 text-sm">
              {cancelar}
            </Link>
          </form>
        </div>
      </ResourcePanel>
    );
  } else if (creating || editId) {
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
            data-shortcut="crear-aqui"
            className="boton-calido min-h-11 px-5 py-2 text-sm"
          >
            {t("T-251")}
          </Link>
        ) : null}
      </div>
      {saved || viewSaved || batchDone ? (
        <output className="admin-feedback block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 text-sm font-semibold text-oe-navy">
          {batchDone
            ? t("T-4941", { hechas: Number(batchDone) || 0, fallidas: Number(batchFailed) || 0 })
            : t(viewSaved ? "T-4931" : "T-259")}
        </output>
      ) : null}
      <DownloadNotice searchParams={searchParams} />
      {exportLimitNotice(total)}
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
        columns={resource.columns.map((column) => ({ key: column.key, label: column.label }))}
        visibleColumns={visible}
        views={{
          items: savedViews.map((view) => ({
            id: view.id,
            name: view.name,
            href: view.query ? `${basePath}?${view.query}` : basePath,
            shared: view.shared,
            mine: view.ownerId === actor.personId,
            current: view.query === viewQuery,
          })),
          query: viewQuery,
          returnTo: listHref,
          save: saveViewAction,
          remove: deleteViewAction,
        }}
        exportHref={buildHref(`/api/export/${resource.key}`, {
          q,
          ...filters,
          ...fixedFilters,
          // El exporte vuelve a esta pantalla si pide sesión o paso de seguridad (ADR-113, regla 10).
          [DOWNLOAD_SCREEN_PARAM]: listHref,
        })}
        canCreate={false}
      />
      <ListShortcuts>
        <ResourceTable
          columns={columns}
          rows={rows}
          {...(canBatch
            ? {
                selection: {
                  form: batchForm,
                  name: "ids",
                  allLabel: seleccionarTodas ?? "",
                  rowLabel: (row: { id: string }) => {
                    const value = resource.columns[0]?.render(row);
                    const name =
                      value === null || value === undefined
                        ? row.id
                        : typeof value === "object"
                          ? value.text
                          : String(value);
                    return t("T-4936", { fila: name });
                  },
                },
              }
            : {})}
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
          rowLinks={resource.rowLinks ?? []}
          rowActionForm={(row, action) => (
            <ActionForm action={rowActionAction}>
              <input type="hidden" name="__resource" value={resource.key} />
              <input type="hidden" name="__action" value={action.key} />
              <input type="hidden" name="__id" value={row.id} />
              <input type="hidden" name="__returnTo" value={listHref} />
              <ResourceSubmitButton label={action.label} />
            </ActionForm>
          )}
          inlineCell={(row, column, display) => {
            const fieldName = resource.inlineEdit?.[column.key];
            const field = fieldName
              ? inlineFields.find((item) => item.name === fieldName)
              : undefined;
            if (!field) return null;
            return (
              <InlineEditCell
                resourceKey={resource.key}
                id={row.id}
                field={{
                  name: field.name,
                  label: field.label,
                  type: field.type,
                  ...(field.options ? { options: field.options } : {}),
                  ...(field.emptyOption ? { emptyOption: field.emptyOption } : {}),
                  ...(field.required ? { required: true } : {}),
                }}
                value={resource.toFormValues(row)[field.name] ?? ""}
                returnTo={listHref}
                action={inlineEditAction}
              >
                {display}
              </InlineEditCell>
            );
          }}
        />
      </ListShortcuts>
      {canBatch ? (
        <BatchBar
          form={batchForm}
          name="ids"
          countLabel={{ one: uno ?? "", other: varios ?? "" }}
          action={basePath}
        >
          {Object.entries(listParams).map(([key, value]) =>
            value && key !== "pagina" ? (
              <input key={key} type="hidden" name={key} value={value} />
            ) : null,
          )}
          <label className="sr-only" htmlFor={`${batchForm}-accion`}>
            {accionLote}
          </label>
          <select
            id={`${batchForm}-accion`}
            name="lote"
            className="admin-input min-h-9 rounded-xl border border-borde bg-fondo px-2 text-sm"
          >
            {batchActions.map((action) => (
              <option key={action.key} value={action.key}>
                {action.label}
              </option>
            ))}
          </select>
          <button type="submit" className="boton-primario min-h-9 px-3 py-1 text-sm">
            {verVistaPrevia}
          </button>
        </BatchBar>
      ) : null}
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
