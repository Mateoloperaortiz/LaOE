"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Lista de enlaces secundaria: conserva semántica nativa y devuelve el foco al cerrar con Escape. */
export function AdminActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        ref.current?.open &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      ) {
        ref.current.open = false;
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current?.open) {
        event.stopPropagation();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className="boton-secundario min-h-10 cursor-pointer px-4 py-2 text-sm">
        {label}
      </summary>
      <div
        className="fixed inset-x-4 bottom-4 z-30 flex flex-col rounded-xl border border-borde bg-fondo p-1 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:z-20 sm:mt-2 sm:w-64"
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("a") && ref.current) {
            ref.current.open = false;
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}
