import Link from "next/link";
import { Insignia } from "@/shared/brand";
import type { CellValue, Column, RowAction } from "./types";

type Props<Row extends { id: string }> = {
  columns: Column<Row>[];
  rows: Row[];
  editHref(row: Row): string;
  labels: { edit: string; empty: string };
  rowActions?: RowAction<Row>[];
  rowActionForm?: (row: Row, action: RowAction<Row>) => React.ReactNode;
};

function Cell({ value }: { value: CellValue }) {
  if (value === null) {
    return null;
  }
  if (typeof value === "object") {
    return <Insignia fondo={value.badge}>{value.text}</Insignia>;
  }
  return <>{value}</>;
}

export function ResourceTable<Row extends { id: string }>({
  columns,
  rows,
  editHref,
  labels,
  rowActions = [],
  rowActionForm,
}: Props<Row>) {
  if (rows.length === 0) {
    return <p className="text-tinta-suave">{labels.empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
      <table className="w-full text-left text-sm">
        <thead className="eyebrow bg-fondo-suave text-xs">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-3 py-2 ${column.className ?? ""}`}>
                {column.label}
              </th>
            ))}
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">{labels.edit}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-borde align-top">
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-2 ${column.className ?? ""}`}>
                  <Cell value={column.render(row)} />
                </td>
              ))}
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <div className="inline-flex items-center gap-2">
                  {rowActions
                    .filter((action) => action.applies?.(row) ?? true)
                    .map((action) => (
                      <span key={action.key}>{rowActionForm?.(row, action)}</span>
                    ))}
                  <Link href={editHref(row)} className="boton-secundario min-h-9 px-4 py-1 text-sm">
                    {labels.edit}
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
