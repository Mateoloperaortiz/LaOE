import type { ReactNode } from "react";

/** Las matrices comparativas conservan columnas; su desplazamiento también admite teclado. */
export function AdminTableRegion({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: región desplazable accesible con teclado
      tabIndex={0}
      className={`admin-matrix min-w-0 overflow-x-auto rounded-xl border border-borde ${className}`}
    >
      {children}
    </section>
  );
}
