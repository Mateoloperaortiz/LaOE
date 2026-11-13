"use client";

import { useEffect, useId, useRef } from "react";
import { t, tList } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { LayoutColumnsIcon } from "@/shared/ui/icons/LayoutColumnsIcon";
import { XIcon } from "@/shared/ui/icons/XIcon";
import { buildHref, COLUMNS_PARAM } from "./table-view";
import type { FilterDefinition } from "./types";

type Props = {
  basePath: string;
  q: string;
  filters: FilterDefinition[];
  filterValues: Record<string, string>;
  labels: { search: string; create: string; exportCsv: string; all: string };
  createHref: string;
  exportHref: string;
  canCreate: boolean;
  /** Las columnas de la tabla, para elegir cuáles se ven (ADR-167 regla 4). */
  columns?: { key: string; label: string }[];
  /** Las visibles; `null` cuando se ven todas. */
  visibleColumns?: string[] | null;
  /** Vistas guardadas de esta tabla (ADR-170 regla 1) y cómo guardar la actual. */
  views?: {
    items: {
      id: string;
      name: string;
      href: string;
      shared: boolean;
      mine: boolean;
      current: boolean;
    }[];
    query: string;
    returnTo: string;
    save: (formData: FormData) => Promise<void>;
    remove: (formData: FormData) => Promise<void>;
  };
};

// GET conserva una URL compartible. Cambiar búsqueda o filtros reinicia la paginación; las columnas
// elegidas se conservan. Cada filtro activo es una ficha que se quita sola (ADR-167 regla 4).
export function ResourceToolbar({
  basePath,
  q,
  filters,
  filterValues,
  labels,
  createHref,
  exportHref,
  canCreate,
  columns = [],
  visibleColumns = null,
  views,
}: Props) {
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const visibleFilters = filters.filter((filter) => filter.options.length > 0);
  const activeFilters = visibleFilters.filter((filter) => Boolean(filterValues[filter.key])).length;
  const hasQuery = Boolean(q || activeFilters);
  const columnsParam = visibleColumns ? visibleColumns.join(",") : "";
  const keep = columnsParam ? { [COLUMNS_PARAM]: columnsParam } : {};
  const [columnasLabel, aplicarLabel] = tList("T-4905");
  const [
    vistasLabel,
    guardarVista,
    nombreVista,
    compartirVista,
    guardarLabel,
    borrarLabel,
    compartida,
  ] = tList("T-4930");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (disclosure.current) disclosure.current.open = media.matches || activeFilters > 0;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [activeFilters]);
  const chips = [
    ...(q
      ? [
          {
            key: "q",
            text: t("T-4907", { q }),
            href: buildHref(basePath, { ...filterValues, ...keep }),
          },
        ]
      : []),
    ...visibleFilters.flatMap((filter) => {
      const value = filterValues[filter.key];
      if (!value) return [];
      const option = filter.options.find((item) => item.value === value);
      const rest = Object.fromEntries(
        Object.entries(filterValues).filter(([key]) => key !== filter.key),
      );
      return [
        {
          key: filter.key,
          text: `${filter.label}: ${option?.label ?? value}`,
          href: buildHref(basePath, { q, ...rest, ...keep }),
        },
      ];
    }),
  ];
  return (
    <div className="admin-resource-toolbar flex min-w-0 flex-col gap-4">
      <ActionForm
        key={`${q}:${JSON.stringify(filterValues)}`}
        action={basePath}
        method="get"
        className="flex min-w-0 flex-col gap-3"
      >
        {columnsParam ? <input type="hidden" name={COLUMNS_PARAM} value={columnsParam} /> : null}
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
              <label htmlFor={`${id}-q`} className="text-sm font-semibold">
                {labels.search}
              </label>
              <input
                id={`${id}-q`}
                name="q"
                type="search"
                defaultValue={q}
                className="admin-input w-full min-w-0 rounded-xl border border-borde bg-fondo px-3 py-2.5 text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-titulo"
              />
            </div>
            <button type="submit" className="boton-secundario min-h-11 px-4 py-2 text-sm">
              {labels.search}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={exportHref} className="boton-secundario min-h-11 px-4 py-2 text-sm">
              {labels.exportCsv}
            </a>
            {canCreate ? (
              <Link href={createHref} className="boton-calido min-h-11 px-4 py-2 text-sm">
                {labels.create}
              </Link>
            ) : null}
          </div>
        </div>
        {visibleFilters.length > 0 ? (
          <details
            ref={disclosure}
            open={activeFilters > 0}
            className="admin-filter-disclosure rounded-xl border border-borde"
          >
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
              {t("T-1420")}
              {activeFilters ? ` (${activeFilters})` : ""}
            </summary>
            <div className="admin-filter-fields flex min-w-0 flex-wrap items-end gap-3 px-4 pb-4">
              {visibleFilters.map((filter) => (
                <div key={filter.key} className="flex min-w-0 flex-1 basis-40 flex-col gap-2">
                  <label htmlFor={`${id}-${filter.key}`} className="text-sm font-medium">
                    {filter.label}
                  </label>
                  <select
                    id={`${id}-${filter.key}`}
                    name={filter.key}
                    defaultValue={filterValues[filter.key] ?? ""}
                    className="admin-input min-h-11 w-full min-w-0 rounded-xl border border-borde bg-fondo px-3 py-2 text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-titulo"
                  >
                    <option value="">{labels.all}</option>
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button type="submit" className="boton-secundario min-h-11 px-4 py-2 text-sm">
                {t("T-1421")}
              </button>
            </div>
          </details>
        ) : null}
      </ActionForm>
      {chips.length > 0 || columns.length > 1 || views ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <ul className="admin-chips">
            {chips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={chip.href}
                  className="admin-chip"
                  aria-label={t("T-4906", { filtro: chip.text })}
                >
                  <span>{chip.text}</span>
                  <XIcon size={14} />
                </Link>
              </li>
            ))}
            {hasQuery ? (
              <li>
                <Link
                  href={buildHref(basePath, keep)}
                  className="inline-flex min-h-8 items-center text-sm font-semibold underline underline-offset-4"
                >
                  {t("T-1422")}
                </Link>
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {views ? (
              <details className="admin-views">
                <summary className="boton-secundario inline-flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm">
                  {vistasLabel}
                  {views.items.length ? ` (${views.items.length})` : ""}
                </summary>
                <div className="admin-columns-panel">
                  {views.items.length > 0 ? (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {views.items.map((view) => (
                        <li key={view.id} className="flex items-center justify-between gap-2">
                          <Link
                            href={view.href}
                            aria-current={view.current ? "page" : undefined}
                            className="admin-view-link"
                          >
                            {view.name}
                            {view.shared ? (
                              <span className="text-xs text-tinta-secundaria"> · {compartida}</span>
                            ) : null}
                          </Link>
                          {view.mine ? (
                            <form action={views.remove}>
                              <input type="hidden" name="__id" value={view.id} />
                              <input type="hidden" name="__returnTo" value={views.returnTo} />
                              <button
                                type="submit"
                                className="admin-inline-trigger opacity-100"
                                aria-label={`${borrarLabel}: ${view.name}`}
                                title={`${borrarLabel}: ${view.name}`}
                              >
                                <XIcon size={14} />
                              </button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <form
                    action={views.save}
                    className="flex flex-col gap-2 border-t border-borde pt-2"
                  >
                    <input type="hidden" name="__basePath" value={basePath} />
                    <input type="hidden" name="__query" value={views.query} />
                    <p className="text-sm font-semibold">{guardarVista}</p>
                    <label htmlFor={`${id}-vista`} className="sr-only">
                      {nombreVista}
                    </label>
                    <input
                      id={`${id}-vista`}
                      name="name"
                      required
                      minLength={2}
                      maxLength={60}
                      placeholder={nombreVista}
                      className="admin-input min-h-11 rounded-xl border border-borde bg-fondo px-3 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="shared" />
                      {compartirVista}
                    </label>
                    <button type="submit" className="boton-primario min-h-11 px-4 py-2 text-sm">
                      {guardarLabel}
                    </button>
                  </form>
                </div>
              </details>
            ) : null}
            {columns.length > 1 ? (
              <details className="admin-columns">
                <summary className="boton-secundario inline-flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm">
                  <LayoutColumnsIcon size={16} />
                  {columnasLabel}
                </summary>
                <form action={basePath} method="get" className="admin-columns-panel">
                  {q ? <input type="hidden" name="q" value={q} /> : null}
                  {Object.entries(filterValues).map(([key, value]) =>
                    value ? <input key={key} type="hidden" name={key} value={value} /> : null,
                  )}
                  <fieldset className="flex flex-col gap-2">
                    <legend className="sr-only">{columnasLabel}</legend>
                    {columns.map((column) => (
                      <label key={column.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={COLUMNS_PARAM}
                          value={column.key}
                          defaultChecked={!visibleColumns || visibleColumns.includes(column.key)}
                        />
                        {column.label}
                      </label>
                    ))}
                  </fieldset>
                  <button type="submit" className="boton-primario min-h-11 px-4 py-2 text-sm">
                    {aplicarLabel}
                  </button>
                </form>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
