import Link from "next/link";
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

// Búsqueda y filtros por GET (URL compartible); crear y exportar como enlaces.
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
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <form action={basePath} method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="eyebrow text-xs">
            {labels.search}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            className="min-w-64 rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
          />
        </div>
        {/* Un filtro sin opciones es fijo (lo pone la ruta) y no se muestra en la barra. */}
        {filters
          .filter((filter) => filter.options.length > 0)
          .map((filter) => (
            <div key={filter.key} className="flex flex-col gap-1">
              <label htmlFor={`filtro-${filter.key}`} className="eyebrow text-xs">
                {filter.label}
              </label>
              <select
                id={`filtro-${filter.key}`}
                name={filter.key}
                defaultValue={filterValues[filter.key] ?? ""}
                className="rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
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
        <button type="submit" className="boton-secundario min-h-10 px-4 py-2 text-sm">
          {labels.search}
        </button>
      </form>
      <div className="flex items-center gap-2">
        <a href={exportHref} className="boton-secundario min-h-10 px-4 py-2 text-sm">
          {labels.exportCsv}
        </a>
        {canCreate ? (
          <Link href={createHref} className="boton-calido min-h-10 px-4 py-2 text-sm">
            {labels.create}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
