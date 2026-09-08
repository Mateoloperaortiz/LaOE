"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useAdminFormDraft } from "./AdminFormDrafts";

/** Bloquea cambios durante el envío y recupera el borrador al volver de un error del servidor. */
export function AdminFormBody({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  const fields = useRef<HTMLFieldSetElement>(null);
  const draft = useAdminFormDraft();
  useEffect(() => {
    const form = fields.current?.form;
    if (!form) return;
    const capture = () => draft.capture(form);
    form.addEventListener("submit", capture, true);
    return () => form.removeEventListener("submit", capture, true);
  }, [draft]);
  useEffect(() => {
    if (pending) return;
    const form = fields.current?.form;
    if (!form) return;
    const scope = form.closest("dialog") ?? form.closest("main") ?? form;
    const error = scope.querySelector<HTMLElement>('[role="alert"]');
    if (error) {
      draft.restore(form);
      const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
      error.tabIndex = -1;
      (invalid ?? error).focus();
    }
  }, [draft, pending]);
  return (
    <fieldset
      ref={fields}
      disabled={pending}
      aria-busy={pending}
      aria-disabled={pending || undefined}
      className="contents"
      onClickCapture={(event) => {
        if (pending && (event.target as HTMLElement).closest("a")) event.preventDefault();
      }}
    >
      {children}
    </fieldset>
  );
}
