"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from "react";

type Props = {
  title: string;
  closeHref: string;
  closeLabel: string;
  children: ReactNode;
};

// La URL sigue siendo la fuente de verdad. El dialog aporta modalidad y navegación por teclado.
export function ResourcePanel({ title, closeHref, closeLabel, children }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [closing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const openerHref = opener?.closest("a")?.getAttribute("href");
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    heading.current?.focus({ preventScroll: true });
    const updateBusy = () => setBusy(Boolean(element.querySelector('[aria-busy="true"]')));
    const observer = new MutationObserver(updateBusy);
    observer.observe(element, { attributes: true, subtree: true, attributeFilter: ["aria-busy"] });
    updateBusy();
    return () => {
      observer.disconnect();
      element.close();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        const replacement = openerHref
          ? [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
              (link) => link.getAttribute("href") === openerHref,
            )
          : null;
        const target = opener?.isConnected && opener !== document.body ? opener : replacement;
        if (target) {
          target.focus({ preventScroll: true });
        } else {
          const title = document.querySelector<HTMLElement>("main h1");
          title?.setAttribute("tabindex", "-1");
          title?.focus({ preventScroll: true });
        }
      });
    };
  }, []);

  function close() {
    if (dialog.current?.querySelector('[aria-busy="true"]')) return;
    startTransition(() => router.replace(closeHref, { scroll: false }));
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="admin-panel fixed inset-y-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-none border-0 border-l border-borde bg-fondo p-0 text-tinta shadow-2xl backdrop:bg-oe-navy/50 sm:max-w-[40rem]"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="admin-panel-header flex shrink-0 items-start justify-between gap-4 border-b border-borde bg-fondo px-5 py-4 sm:px-8 sm:py-5">
          <h2 ref={heading} id={titleId} tabIndex={-1} className="text-display-md outline-none">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={closing || busy}
            className="boton-secundario min-h-11 shrink-0 px-4 py-2 text-sm disabled:opacity-60"
          >
            {closeLabel}
          </button>
        </div>
        <div className="admin-panel-body flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-5 sm:p-8">
          {children}
        </div>
      </div>
    </dialog>
  );
}
