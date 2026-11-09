import type { ReactNode } from "react";

// Cabecera de una pantalla de trabajo (ADR-158 regla 2): el título en Plus Jakarta Sans, 28/34 y peso
// 800, en tipo oración; debajo, una línea secundaria opcional y, a la derecha, las acciones de la
// pantalla, de las que solo una es principal (regla 5).

export function ScreenHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`.trim()}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="titulo-pantalla text-balance">{title}</h1>
        {description ? (
          <p className="text-secundario text-tinta-secundaria">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
