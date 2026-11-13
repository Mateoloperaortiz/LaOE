"use client";

import { type ReactNode, useId, useRef } from "react";
import { XIcon } from "@/shared/ui/icons/XIcon";
import { useCloseTo, useFocusOnOpen, useModalDialog } from "@/shared/ui/use-overlay";

// Hoja inferior de Mi OE y el modo de campo (tramo R6-B, con el aspecto de ADR-163). Sube desde abajo en
// el celular, al alcance del pulgar; desde 640 px se centra como un diálogo. La URL la abre y cerrar
// vuelve a `closeHref`: con el botón, con Esc o tocando fuera de la hoja.

export function BottomSheet({
  title,
  description,
  closeHref,
  closeLabel,
  children,
}: {
  title: string;
  description?: ReactNode;
  closeHref: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const { close, closing } = useCloseTo(closeHref, dialog);
  useModalDialog(dialog);
  useFocusOnOpen(heading);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tocar el fondo es un atajo del clic; con el teclado cierran Esc (onCancel) y el botón de cerrar.
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-[1.5rem] border-0 border-t border-superficie-borde bg-superficie p-0 text-tinta backdrop:bg-oe-navy/40 motion-safe:animate-[hoja-sube_220ms_cubic-bezier(0.2,0.8,0.2,1)] sm:inset-auto sm:m-auto sm:max-w-[28rem] sm:rounded-[1.5rem] sm:border"
    >
      <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <span
          aria-hidden="true"
          className="mx-auto h-1 w-10 shrink-0 rounded-full bg-linea sm:hidden"
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 ref={heading} id={titleId} tabIndex={-1} className="titulo-seccion outline-none">
              {title}
            </h2>
            {description ? (
              <div className="text-secundario text-tinta-secundaria">{description}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={closing}
            aria-label={closeLabel}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-relleno text-tinta-secundaria hover:text-titulo disabled:opacity-60"
          >
            <XIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
