"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { type FocusPlace, operationCommand } from "@/shared/admin-kit/operation-keys";
import { t, tList } from "@/shared/copy/client";
import { isTextEntry } from "@/shared/ui/list-navigation";

// Los atajos de la Operación y su mapa (ADR-167 regla 1, plan maestro anexo A). Escucha la página y
// ejecuta lo que dice `operationCommand`; cada atajo hace lo mismo que un clic que ya existe:
// - `?` abre este mapa; G y una letra van al espacio; C crea (el «Nuevo» de la pantalla o el menú
//   «Crear»); `/` busca en la tabla (o abre ⌘K si no hay tabla); E edita el registro con foco o el
//   abierto; ⌘Enter guarda el formulario donde está el foco.
// - J, K, X, Enter y Esc son de la lista y del panel (ListShortcuts, ResourcePanel): aquí solo se
//   muestran en el mapa.

const GO_WINDOW_MS = 1500;

export type ShortcutSpace = { key: string; href: string; label: string };

function focusPlace(): FocusPlace {
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextEntry(active)) return "typing";
  if (document.querySelector("dialog[open]")) return "dialog";
  return "page";
}

function clickFirst(selectors: string[]): boolean {
  for (const selector of selectors) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) {
      target.click();
      return true;
    }
  }
  return false;
}

export function OperationShortcuts({ spaces }: { spaces: ShortcutSpace[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pendingGo = useRef<number | null>(null);
  const keys = tList("T-4896");
  const [mapTitle, spacesTitle, thenLabel] = tList("T-4895");
  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;

  useEffect(() => {
    const clearGo = () => {
      if (pendingGo.current !== null) window.clearTimeout(pendingGo.current);
      pendingGo.current = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const command = operationCommand(event, focusPlace(), pendingGo.current !== null);
      if (pendingGo.current !== null && command?.kind !== "go") clearGo();
      if (!command) return;
      switch (command.kind) {
        case "map":
          event.preventDefault();
          dialog.current?.showModal();
          return;
        case "go-prefix":
          clearGo();
          pendingGo.current = window.setTimeout(clearGo, GO_WINDOW_MS);
          return;
        case "go": {
          clearGo();
          const space = spacesRef.current.find((item) => item.key === command.key);
          if (!space) return;
          event.preventDefault();
          router.push(space.href);
          return;
        }
        case "create":
          if (
            clickFirst(['main [data-shortcut="crear-aqui"]', '[data-shortcut="crear"] > summary'])
          ) {
            event.preventDefault();
          }
          return;
        case "search": {
          const search = document.querySelector<HTMLInputElement>('main input[type="search"]');
          event.preventDefault();
          if (search) search.focus();
          else clickFirst(['[data-shortcut="buscar"]']);
          return;
        }
        case "edit": {
          const active = document.activeElement;
          const row = active instanceof HTMLElement ? active.closest("[data-row]") : null;
          const target =
            row?.querySelector<HTMLElement>('[data-shortcut="editar"]') ??
            document.querySelector<HTMLElement>('main [data-shortcut="editar"]');
          if (!target) return;
          event.preventDefault();
          target.click();
          return;
        }
        case "save": {
          const active = document.activeElement;
          const form = active instanceof HTMLElement ? active.closest("form") : null;
          if (!form) return;
          event.preventDefault();
          form.requestSubmit();
          return;
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearGo();
    };
  }, [router]);

  const rows: [string, string | undefined][] = [
    ["⌘K", keys[0]],
    ["?", keys[1]],
    ["C", keys[2]],
    ["/", keys[3]],
    ["J · K", keys[4]],
    ["Enter", keys[5]],
    ["Esc", keys[6]],
    ["X", keys[7]],
    ["E", keys[8]],
    ["⌘Enter", keys[9]],
  ];
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="admin-shortcuts m-auto w-full max-w-lg rounded-2xl bg-superficie p-6 text-tinta shadow-2xl backdrop:bg-oe-navy/50"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-display-md">
          {mapTitle}
        </h2>
        <button
          type="button"
          className="boton-secundario min-h-11 px-4 py-2 text-sm"
          onClick={() => dialog.current?.close()}
        >
          {t("T-291")}
        </button>
      </div>
      <dl className="admin-shortcuts-list mt-4">
        {rows.map(([key, label]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      {spaces.length > 0 ? (
        <>
          <h3 className="etiqueta-corta mt-6 text-tinta-secundaria">{spacesTitle}</h3>
          <dl className="admin-shortcuts-list mt-2">
            {spaces.map((space) => (
              <div key={space.key}>
                <dt>
                  <kbd>G</kbd> <span className="sr-only">{thenLabel}</span>
                  <kbd>{space.key.toUpperCase()}</kbd>
                </dt>
                <dd>{space.label}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </dialog>
  );
}
