"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { listCommand, moveIndex } from "@/shared/ui/list-navigation";

// Atajos de una lista o una tabla de trabajo (ADR-159 regla 5, tramo R6-B): J y K mueven el foco al
// enlace o botón principal de la fila siguiente o anterior, X marca su casilla y Enter abre lo que tiene
// el foco, como cualquier enlace. Ningún atajo actúa mientras se escribe ni con un diálogo abierto, y
// todo lo que hacen también se hace con un clic.

const ROW = "[data-row]";
const TARGET = 'a[href], button:not([disabled]), input[type="checkbox"]:not([data-row-select])';

function rowTarget(row: Element): HTMLElement | null {
  return row.querySelector<HTMLElement>(TARGET);
}

export function ListShortcuts({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const root = container.current;
      if (!root || event.defaultPrevented) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (active?.closest("dialog[open]") && !root.contains(active)) return;
      const command = listCommand(event, active ?? {});
      if (!command) return;
      const rows = Array.from(root.querySelectorAll(ROW));
      if (rows.length === 0) return;
      const focused = active ? rows.findIndex((row) => row.contains(active)) : -1;
      const current =
        focused >= 0
          ? focused
          : rows.findIndex((row) => row.getAttribute("aria-current") === "true");
      if (command === "toggle") {
        const box =
          current >= 0 ? rows[current]?.querySelector<HTMLInputElement>("[data-row-select]") : null;
        if (!box) return;
        event.preventDefault();
        box.click();
        return;
      }
      const next = rows[moveIndex(current, rows.length, command)];
      const target = next ? rowTarget(next) : null;
      if (!target) return;
      event.preventDefault();
      target.focus();
      target.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div ref={container} className="min-w-0">
      {children}
    </div>
  );
}
