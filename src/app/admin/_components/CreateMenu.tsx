"use client";

import { useEffect, useRef } from "react";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { PlusIcon } from "@/shared/ui/icons/PlusIcon";
import type { CreateItem } from "../_kit/create-items";

// El botón «Crear» de la barra superior (ADR-167 regla 2, plan maestro §5.2): lo que el actor puede
// crear, cada cosa dentro de su alcance, y lo mismo que ofrece ⌘K como acción. Sin nada que crear no
// aparece. Se abre con C cuando la pantalla no tiene su propio «Nuevo».

export function CreateMenu({ items, label }: { items: CreateItem[]; label: string }) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        menu.current?.removeAttribute("open");
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <details
      ref={menu}
      className="admin-create"
      data-shortcut="crear"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          event.currentTarget.querySelector<HTMLElement>("a")?.focus();
        }
      }}
    >
      <summary>
        <PlusIcon size={18} />
        <span className="admin-create-label">{label}</span>
      </summary>
      <ul className="admin-create-menu">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} onClick={() => menu.current?.removeAttribute("open")}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
