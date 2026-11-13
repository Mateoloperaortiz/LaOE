"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { XIcon } from "@/shared/ui/icons/XIcon";
import { isTextEntry } from "@/shared/ui/list-navigation";
import { useCloseTo, useFocusOnOpen, useModalDialog, useWideLayout } from "@/shared/ui/use-overlay";

// Detalle de la vista dividida (ADR-159 regla 5, tramo R6-B). Desde 1280 px es un panel junto a la lista,
// que no la tapa; por debajo es un diálogo, como el `ResourcePanel` de ADR-043 regla 4. La URL lleva el
// registro abierto y cerrar vuelve a `closeHref`. Esc cierra, salvo mientras se escribe en un campo, para
// no perder lo escrito.
// El panel no es modal: el foco se queda en la lista, para seguir con J, K y Enter mientras el detalle
// cambia al lado. El diálogo sí es modal, y al abrirse lleva el foco a su título.

const CLOSE_BUTTON =
  "flex size-10 shrink-0 items-center justify-center rounded-control bg-relleno text-tinta-secundaria hover:text-titulo disabled:opacity-60";

export function DetailPanel({
  title,
  eyebrow,
  closeHref,
  closeLabel,
  children,
}: {
  title: string;
  /** Una línea corta arriba del título: el tipo de registro. */
  eyebrow?: ReactNode;
  closeHref: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const wide = useWideLayout();
  const root = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const { close, closing } = useCloseTo(closeHref, wide ? root : dialog);
  useModalDialog(dialog, !wide);
  useFocusOnOpen(heading, !wide);

  useEffect(() => {
    if (!wide) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && isTextEntry(active)) return;
      if (active?.closest("dialog[open]")) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [wide, close]);

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <div className="text-secundario text-tinta-secundaria">{eyebrow}</div> : null}
        <h2 ref={heading} id={titleId} tabIndex={-1} className="titulo-seccion outline-none">
          {title}
        </h2>
      </div>
      <button
        type="button"
        onClick={close}
        disabled={closing}
        aria-label={closeLabel}
        className={CLOSE_BUTTON}
      >
        <XIcon size={16} />
      </button>
    </div>
  );

  if (wide) {
    return (
      <section
        ref={root}
        aria-labelledby={titleId}
        className="sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col gap-4 overflow-y-auto rounded-tarjeta border border-superficie-borde bg-superficie p-5 text-tinta sombra-flota"
      >
        {header}
        {children}
      </section>
    );
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="fixed inset-y-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-none border-0 border-l border-superficie-borde bg-superficie p-0 text-tinta backdrop:bg-oe-navy/40 sm:max-w-[32rem]"
    >
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-5">
        {header}
        {children}
      </div>
    </dialog>
  );
}
