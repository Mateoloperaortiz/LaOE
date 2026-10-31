"use client";

import { useEffect, useId, useRef } from "react";
import { t } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
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
};

// GET conserva una URL compartible. Cambiar búsqueda o filtros reinicia la paginación.
export function ResourceToolbar({
  basePath,
  q,
  filters,
  filterValues,
  labels,
  createHref,
  exportHref,
  canCreate,
}: Props) {
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const visibleFilters = filters.filter((filter) => filter.options.length > 0);
  const activeFilters = visibleFilters.filter((filter) => Boolean(filterValues[filter.key])).length;
  const hasQuery = Boolean(q || activeFilters);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (disclosure.current) disclosure.current.open = media.matches || activeFilters > 0;
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [activeFilters]);
  return (
    <div className="admin-resource-toolbar flex min-w-0 flex-col gap-4">
      <ActionForm
        key={`${q}:${JSON.stringify(filterValues)}`}
        action={basePath}
        method="get"
        className="flex min-w-0 flex-col gap-3"
      >
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
        {hasQuery ? (
          <Link
            href={basePath}
            className="self-start text-sm font-semibold underline underline-offset-4"
          >
            {t("T-1422")}
          </Link>
        ) : null}
      </ActionForm>
    </div>
  );
}
