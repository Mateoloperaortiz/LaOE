import Link from "next/link";
import { Insignia } from "@/shared/brand";
import { t } from "@/shared/copy";
import { ResourceActionMenu } from "./ResourceActionMenu";
import type { CellValue, Column, RowAction, RowLink } from "./types";

type Props<Row extends { id: string }> = {
  columns: Column<Row>[];
  rows: Row[];
  /** Sin editHref no hay botón de editar (recursos que solo crean o revocan). */
  editHref?: ((row: Row) => string) | undefined;
  labels: { edit: string; empty: string; emptyHelp?: string };
  caption?: string;
  emptyAction?: { href: string; label: string } | undefined;
  rowActions?: RowAction<Row>[];
  rowLinks?: RowLink<Row>[];
  rowActionForm?: (row: Row, action: RowAction<Row>) => React.ReactNode;
};

function Cell({ value }: { value: CellValue }) {
  if (value === null) return <span className="text-tinta-suave">—</span>;
  if (typeof value === "object") {
    if ("href" in value) {
      const link = value.href.startsWith("/admin") ? (
        <Link href={value.href} className="font-semibold">
          {value.text}
        </Link>
      ) : (
        <a href={value.href} target="_blank" rel="noopener noreferrer" className="font-semibold">
          {value.text}
        </a>
      );
      return value.note ? (
        <>
          {link}
          <span className="mt-1 block text-xs font-semibold text-tinta-suave">{value.note}</span>
        </>
      ) : (
        link
      );
    }
    return <Insignia fondo={value.badge}>{value.text}</Insignia>;
  }
  return <>{value}</>;
}

export function ResourceTable<Row extends { id: string }>({
  columns,
  rows,
  editHref,
  labels,
  caption = t("T-1432"),
  emptyAction,
  rowActions = [],
  rowLinks = [],
  rowActionForm,
}: Props<Row>) {
  if (rows.length === 0) {
    return (
      <div className="admin-empty-state flex flex-col items-start gap-3 rounded-xl border border-borde bg-fondo px-6 py-8">
        <p className="font-semibold">{labels.empty}</p>
        {labels.emptyHelp ? <p className="text-sm text-tinta-suave">{labels.emptyHelp}</p> : null}
        {emptyAction ? (
          <Link href={emptyAction.href} className="boton-calido min-h-11 px-4 py-2 text-sm">
            {emptyAction.label}
          </Link>
        ) : null}
      </div>
    );
  }
  const hasActions = Boolean(editHref || rowLinks.length || (rowActionForm && rowActions.length));
  return (
    <section
      aria-label={caption}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: el teclado puede desplazar una tabla ancha dentro de esta región.
      tabIndex={0}
      className="admin-table-region min-w-0 max-w-full overflow-x-auto rounded-xl border border-borde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-titulo"
    >
      <table className="admin-resource-table w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-fondo-suave text-xs">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`admin-table-heading px-4 py-3 ${column.className ?? ""}`}
              >
                {column.label}
              </th>
            ))}
            {hasActions ? (
              <th scope="col" className="admin-table-heading px-4 py-3">
                {t("T-1426")}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const actions = rowActions.filter((action) => action.applies?.(row) ?? true);
            const actionControls = actions.map((action) => (
              <div key={action.key}>{rowActionForm?.(row, action)}</div>
            ));
            return (
              <tr key={row.id} className="admin-table-row border-t border-borde align-top">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.label}
                    className={`admin-table-cell px-4 py-3 ${column.className ?? ""}`}
                  >
                    <Cell value={column.render(row)} />
                  </td>
                ))}
                {hasActions ? (
                  <td data-label={t("T-1426")} className="admin-table-actions px-4 py-3">
                    <div className="flex flex-wrap items-start gap-2">
                      {rowLinks.map((link) => (
                        <Link
                          key={link.key}
                          href={link.href(row)}
                          aria-label={link.ariaLabel?.(row)}
                          className="boton-secundario min-h-11 px-4 py-2 text-sm"
                        >
                          {link.label}
                        </Link>
                      ))}
                      {editHref ? (
                        <Link
                          href={editHref(row)}
                          scroll={false}
                          data-admin-panel-trigger
                          className="boton-secundario min-h-11 px-4 py-2 text-sm"
                        >
                          {labels.edit}
                        </Link>
                      ) : null}
                      {actions.length > 1 ? (
                        <ResourceActionMenu label={t("T-1426")}>
                          {actionControls}
                        </ResourceActionMenu>
                      ) : (
                        actionControls
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
