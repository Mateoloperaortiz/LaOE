"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from "react";

type DraftValue = { name: string; value: string; checked?: boolean; files?: File[] };
type DraftStore = Map<string, unknown>;
const DraftContext = createContext<DraftStore | null>(null);

/** Memoria de la navegación administrativa: los errores de una acción pueden remontar su formulario.
 * Se descarta al salir/cambiar de operación. No usa almacenamiento persistente ni pone datos en URL. */
export function AdminFormDrafts({ children }: { children: ReactNode }) {
  const drafts = useRef<DraftStore>(new Map());
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (pathname && !search.has("error")) drafts.current.clear();
  }, [pathname, search]);
  return <DraftContext.Provider value={drafts.current}>{children}</DraftContext.Provider>;
}

function controls(form: HTMLFormElement) {
  return [...form.elements].filter(
    (node): node is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      (node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement) &&
      Boolean(node.name) &&
      !node.name.startsWith("$ACTION"),
  );
}
function draftKey(form: HTMLFormElement) {
  return JSON.stringify([
    window.location.pathname,
    controls(form).map((input) => [
      input.name,
      input.type,
      input.type === "hidden" ? input.value : "",
    ]),
  ]);
}

export function useAdminFormDraft() {
  const drafts = useContext(DraftContext);
  return {
    capture(form: HTMLFormElement) {
      drafts?.set(
        draftKey(form),
        controls(form)
          .filter((input) => input.type !== "hidden")
          .map((input) => ({
            name: input.name,
            value: input.value,
            ...(input instanceof HTMLInputElement
              ? { checked: input.checked, ...(input.files ? { files: [...input.files] } : {}) }
              : {}),
          })),
      );
    },
    restore(form: HTMLFormElement) {
      const key = draftKey(form);
      const saved = drafts?.get(key) as DraftValue[] | undefined;
      if (!saved) return;
      const fields = controls(form).filter((input) => input.type !== "hidden");
      for (const [index, input] of fields.entries()) {
        const item = saved[index];
        if (!item || item.name !== input.name) continue;
        if (input instanceof HTMLInputElement && input.type === "file") {
          const transfer = new DataTransfer();
          for (const file of item.files ?? []) transfer.items.add(file);
          input.files = transfer.files;
        } else if (
          input instanceof HTMLInputElement &&
          (input.type === "checkbox" || input.type === "radio")
        ) {
          if (input.checked !== item.checked) input.click();
        } else {
          // Setter nativo para que React también reciba el cambio en controles con estado.
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(
            input,
            item.value,
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      drafts?.delete(key);
    },
    clear(form: HTMLFormElement) {
      drafts?.delete(draftKey(form));
    },
  };
}

/** Estado de un editor que decide qué campos existen (formato, preguntas). Sin él, el formulario
 * remontado tras un error tendría otros campos y su borrador no se podría recuperar. Solo se lee
 * mientras la página muestra el error; el editor lo consume al montarse. */
export function useAdminFormState<T>(name: string) {
  const drafts = useContext(DraftContext);
  const failed = useSearchParams().has("error");
  const key = `estado:${usePathname()}:${name}`;
  return useMemo(
    () => ({
      read: () => (failed ? ((drafts?.get(key) as T | undefined) ?? null) : null),
      write: (value: T) => {
        drafts?.set(key, value);
      },
      clear: () => {
        drafts?.delete(key);
      },
    }),
    [drafts, failed, key],
  );
}
