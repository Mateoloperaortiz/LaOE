import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  closeHref: string;
  closeLabel: string;
  children: ReactNode;
};

// Panel lateral para crear y editar; se abre y cierra por URL (?nuevo=1, ?editar=id).
export function ResourcePanel({ title, closeHref, closeLabel, children }: Props) {
  return (
    <aside
      aria-label={title}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col gap-6 overflow-y-auto border-l border-borde bg-fondo p-6 shadow-2xl textura-granito sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-display-md">{title}</h2>
        <Link
          href={closeHref}
          className="boton-secundario min-h-9 px-4 py-1 text-sm"
          aria-label={closeLabel}
        >
          {closeLabel}
        </Link>
      </div>
      {children}
    </aside>
  );
}
