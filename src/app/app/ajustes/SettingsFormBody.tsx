"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { t } from "@/shared/copy";

/** Formularios sin campos editables: conserva las acciones y bloquea dobles envíos. */
export function SettingsFormBody({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  const fields = useRef<HTMLFieldSetElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    busy.current = pending;
    const form = fields.current?.form;
    if (!form) return;
    const preventDuplicate = (event: SubmitEvent) => {
      if (busy.current) event.preventDefault();
      else busy.current = true;
    };
    form.addEventListener("submit", preventDuplicate);
    return () => form.removeEventListener("submit", preventDuplicate);
  }, [pending]);
  return (
    <fieldset
      ref={fields}
      disabled={pending}
      aria-busy={pending}
      className="contents"
      onClickCapture={(event) => {
        if (pending && (event.target as HTMLElement).closest("a")) event.preventDefault();
      }}
    >
      {children}
      {pending ? (
        <output className="text-sm" aria-live="polite">
          {t("T-1628")}
        </output>
      ) : null}
    </fieldset>
  );
}
