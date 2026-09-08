"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function ResourceActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) {
        menu.current.open = false;
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return (
    <details
      ref={menu}
      className="admin-row-actions-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="boton-secundario min-h-11 cursor-pointer px-4 py-2 text-sm">
        {label}
      </summary>
      <div className="mt-2 flex flex-col items-stretch gap-2 rounded-xl border border-borde bg-fondo p-2">
        {children}
      </div>
    </details>
  );
}
