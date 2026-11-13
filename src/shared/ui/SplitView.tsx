import type { ReactNode } from "react";

// Vista dividida (ADR-159 regla 5, tramo R6-B): la lista y, cuando hay un registro abierto, su detalle.
// Desde 1280 px van lado a lado; por debajo, la lista ocupa todo y el detalle (`DetailPanel`) se abre
// como diálogo. `narrow` dice cuál de los dos va angosto:
// - `detail`: una tabla ancha con una vista rápida al lado, como Personas;
// - `list`: una bandeja con el detalle grande al lado, como la Mesa.

const COLUMNS = {
  detail: "xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]",
  list: "xl:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]",
} as const;

export function SplitView({
  list,
  detail,
  narrow = "detail",
  className = "",
}: {
  list: ReactNode;
  detail?: ReactNode;
  narrow?: keyof typeof COLUMNS;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 ${detail ? `xl:grid xl:items-start xl:gap-4 ${COLUMNS[narrow]}` : ""} ${className}`.trim()}
    >
      <div className="min-w-0">{list}</div>
      {detail ?? null}
    </div>
  );
}
