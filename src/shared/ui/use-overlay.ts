"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useCallback, useEffect, useSyncExternalStore, useTransition } from "react";

// Piezas comunes del panel de detalle y la hoja inferior (tramo R6-B). La URL es la fuente de verdad:
// abrir es llegar a una dirección con el registro o la hoja, y cerrar es volver a `closeHref`.

const WIDE = "(min-width: 80rem)";

function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Desde 1280 px el detalle va junto a la lista (ADR-159 regla 5). El servidor supone escritorio. */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/** Cerrar es volver a `closeHref` sin mover la página; no cierra mientras algo adentro está ocupado. */
export function useCloseTo(closeHref: string, root: RefObject<HTMLElement | null>) {
  const router = useRouter();
  const [closing, startTransition] = useTransition();
  const close = useCallback(() => {
    if (root.current?.querySelector('[aria-busy="true"]')) return;
    startTransition(() => router.replace(closeHref, { scroll: false }));
  }, [closeHref, root, router]);
  return { close, closing };
}

/**
 * Al abrir, el foco va al título. Al cerrar vuelve a lo que lo tenía antes, si sigue en la página, y si
 * no, al título de la pantalla.
 */
export function useFocusOnOpen(heading: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        if (opener?.isConnected && opener !== document.body) {
          opener.focus({ preventScroll: true });
          return;
        }
        const title = document.querySelector<HTMLElement>("main h1");
        title?.setAttribute("tabindex", "-1");
        title?.focus({ preventScroll: true });
      });
    };
  }, [heading, active]);
}

/** Abre un `<dialog>` como modal mientras el componente vive, y bloquea el desplazamiento de la página. */
export function useModalDialog(dialog: RefObject<HTMLDialogElement | null>, active = true) {
  useEffect(() => {
    const element = dialog.current;
    if (!active || !element) return;
    const previousOverflow = document.body.style.overflow;
    if (!element.open) element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [dialog, active]);
}
