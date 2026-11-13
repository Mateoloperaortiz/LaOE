import type { ReactNode } from "react";
import { AppLink } from "@/shared/ui/AppLink";
import { ArrowDownIcon } from "@/shared/ui/icons/ArrowDownIcon";
import { ArrowUpIcon } from "@/shared/ui/icons/ArrowUpIcon";
import { TableSelectAll } from "@/shared/ui/TableSelectAll";

// Tabla de trabajo de la Operación (ADR-159 regla 5, con el aspecto de ADR-163; tramo R6-B).
// - Cabecera fija dentro de su caja, que se desplaza en horizontal cuando la tabla no cabe.
// - Densidad cómoda, con filas de 40 px, o compacta, de 32 px.
// - Orden por enlaces: la URL lleva el estado (ADR-043 regla 3), y `aria-sort` lo anuncia.
// - Selección múltiple con casillas de formulario: cada casilla pertenece al formulario `selection.form`,
//   así que la barra de lote envía los ids sin JavaScript propio. «Seleccionar todas» sí lo usa.
// La tabla no trae textos: todo lo que se lee llega por props.

export type WorkTableDensity = "comoda" | "compacta";

export type WorkTableColumn = {
  key: string;
  label: string;
  /** Alinea a la derecha las cifras. */
  numeric?: boolean;
  /** Ancho fijo de la columna, en una clase de Tailwind (`w-32`). */
  width?: string;
  /** Orden por esta columna: el enlace que la ordena y en qué sentido está hoy. */
  sort?: { href: string; direction: "asc" | "desc" | null };
};

export type WorkTableRow = {
  id: string;
  cells: Record<string, ReactNode>;
  /** El registro abierto en la vista dividida. */
  current?: boolean;
  /** Nombre accesible de su casilla: «Seleccionar a Valeria Ochoa». */
  selectLabel?: string;
  defaultSelected?: boolean;
};

const ROW: Record<WorkTableDensity, string> = {
  comoda: "[&>td]:h-10 [&>td]:py-1.5",
  compacta: "[&>td]:h-8 [&>td]:py-0.5",
};

function SortLink({
  column,
}: {
  column: WorkTableColumn & { sort: NonNullable<WorkTableColumn["sort"]> };
}) {
  const { href, direction } = column.sort;
  return (
    <AppLink
      href={href}
      scroll={false}
      className="inline-flex items-center gap-1 text-inherit no-underline hover:text-titulo hover:underline"
    >
      {column.label}
      {direction === "asc" ? <ArrowUpIcon size={13} /> : null}
      {direction === "desc" ? <ArrowDownIcon size={13} /> : null}
    </AppLink>
  );
}

export function WorkTable({
  caption,
  columns,
  rows,
  density = "comoda",
  selection,
  empty,
  className = "",
}: {
  /** Nombre accesible de la tabla. */
  caption: string;
  columns: WorkTableColumn[];
  rows: WorkTableRow[];
  density?: WorkTableDensity;
  /** Con selección, cada fila lleva una casilla del formulario `form`, con nombre `name` y su id. */
  selection?: { form: string; name: string; allLabel: string };
  /** Lo que se ve cuando no hay filas. */
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }
  return (
    <section
      aria-label={caption}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: el teclado puede desplazar una tabla ancha dentro de esta región.
      tabIndex={0}
      className={`max-h-[70vh] min-w-0 overflow-auto rounded-tarjeta border border-linea-tenue bg-superficie focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`.trim()}
    >
      <table data-work-table className="w-full border-collapse text-left text-secundario">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-panel">
          <tr className="[&>th]:h-10 [&>th]:border-b [&>th]:border-linea-tenue [&>th]:px-3 [&>th]:text-etiqueta [&>th]:font-medium [&>th]:text-tinta-secundaria">
            {selection ? (
              <th scope="col" className="w-11">
                <TableSelectAll
                  form={selection.form}
                  name={selection.name}
                  label={selection.allLabel}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  column.sort
                    ? column.sort.direction === "asc"
                      ? "ascending"
                      : column.sort.direction === "desc"
                        ? "descending"
                        : "none"
                    : undefined
                }
                className={
                  `${column.numeric ? "text-right" : ""} ${column.width ?? ""}`.trim() || undefined
                }
              >
                {column.sort ? (
                  <SortLink column={{ ...column, sort: column.sort }} />
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-row
              aria-current={row.current ? "true" : undefined}
              className={`${ROW[density]} border-b border-[var(--relleno)] last:border-b-0 [&>td]:px-3 ${
                row.current
                  ? "bg-[linear-gradient(90deg,var(--activo),transparent)] shadow-[inset_3px_0_0_var(--accion)]"
                  : "hover:bg-panel"
              }`}
            >
              {selection ? (
                <td className="w-11">
                  <input
                    type="checkbox"
                    data-row-select
                    form={selection.form}
                    name={selection.name}
                    value={row.id}
                    defaultChecked={row.defaultSelected}
                    aria-label={row.selectLabel}
                    className="size-4 accent-[var(--accion)]"
                  />
                </td>
              ) : null}
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.numeric ? "text-right tabular-nums" : undefined}
                >
                  {row.cells[column.key] ?? null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
