import type { ReactNode } from "react";
import { AppLink } from "@/shared/ui/AppLink";
import { ChevronRightIcon } from "@/shared/ui/icons/ChevronRightIcon";

// Cabecera de una pantalla de trabajo (ADR-163 reglas 3 y 9, sobre ADR-158 regla 2): el título en Plus
// Jakarta Sans, peso 600 y tipo oración, con una línea secundaria opcional. Las acciones de la pantalla
// van a la derecha, y solo una es principal.
// En la Operación la cabecera abre con una ruta («Operación › Mesa»): las acciones suben a esa fila y
// debajo queda el título grande, que dice lo que se está viendo. Quien la usa pasa el nombre accesible
// de la ruta, porque este componente no inventa textos.

type Crumb = { label: string; href?: string };

type TrailProps =
  | { trail: readonly Crumb[]; trailLabel: string }
  | { trail?: never; trailLabel?: never };

export function ScreenHeader({
  title,
  description,
  actions,
  trail,
  trailLabel,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
} & TrailProps) {
  const crumbs = trail ?? [];
  const hasTrail = crumbs.length > 0;
  const actionRow = actions ? (
    <div className="flex flex-wrap items-center gap-2">{actions}</div>
  ) : null;
  return (
    <header className={`flex flex-col gap-3 ${className}`.trim()}>
      {hasTrail ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <nav aria-label={trailLabel}>
            <ol className="flex list-none flex-wrap items-center gap-2 p-0 text-secundario">
              {crumbs.map((crumb, index) => {
                const current = index === crumbs.length - 1;
                return (
                  <li key={crumb.label} className="flex items-center gap-2">
                    {index > 0 ? (
                      <span className="text-tinta-secundaria">
                        <ChevronRightIcon size={14} />
                      </span>
                    ) : null}
                    {crumb.href && !current ? (
                      <AppLink
                        href={crumb.href}
                        className="font-medium text-tinta-secundaria no-underline hover:underline"
                      >
                        {crumb.label}
                      </AppLink>
                    ) : (
                      <span
                        aria-current={current ? "page" : undefined}
                        className={
                          current
                            ? "font-semibold text-titulo"
                            : "font-medium text-tinta-secundaria"
                        }
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          {actionRow}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="titulo-pantalla text-balance">{title}</h1>
          {description ? (
            <p className="text-secundario text-tinta-secundaria">{description}</p>
          ) : null}
        </div>
        {hasTrail ? null : actionRow}
      </div>
    </header>
  );
}
