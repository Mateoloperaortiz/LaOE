"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { t, tList } from "@/shared/copy/client";
import { PencilIcon } from "@/shared/ui/icons/PencilIcon";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import type { FieldDefinition } from "./types";

// Edición en línea de una celda del kit (ADR-167 regla 5): el lápiz abre un campo simple en la misma
// celda; Enter guarda con el mismo `update` del recurso y Esc cancela. Lo que se ve fuera de edición
// es la celda de siempre, que llega ya renderizada del servidor.

export type InlineState = { ok: boolean; message: string | null; at: number };

type Props = {
  resourceKey: string;
  id: string;
  field: Pick<FieldDefinition, "name" | "label" | "type" | "options" | "emptyOption" | "required">;
  value: string;
  returnTo: string;
  action: (state: InlineState, formData: FormData) => Promise<InlineState>;
  children: ReactNode;
};

const INPUT_TYPES: Partial<Record<FieldDefinition["type"], string>> = {
  text: "text",
  number: "number",
  date: "date",
  datetime: "datetime-local",
  email: "email",
  url: "url",
};

export function InlineEditCell({
  resourceKey,
  id,
  field,
  value,
  returnTo,
  action,
  children,
}: Props) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  // El campo es controlado: si el pedido no llega (ADR-118 regla 20), lo escrito sigue ahí.
  const [draft, setDraft] = useState(value);
  const [state, formAction, pending] = useGuardedActionState(
    action,
    { ok: false, message: null, at: 0 },
    ({ previous, message }) => ({ ...previous, ok: false, message, at: Date.now() }),
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const [editar, guardar, cancelar] = tList("T-4903");

  useEffect(() => {
    if (state.ok && state.at > 0) {
      setEditing(false);
      trigger.current?.focus();
    }
  }, [state]);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <span className="admin-inline-cell">
        <span>{children}</span>
        <button
          ref={trigger}
          type="button"
          className="admin-inline-trigger"
          aria-label={`${editar ?? ""}: ${field.label}`}
          title={`${editar ?? ""}: ${field.label}`}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          <PencilIcon size={14} />
        </button>
      </span>
    );
  }
  const cancel = () => {
    setEditing(false);
    window.setTimeout(() => trigger.current?.focus(), 0);
  };
  return (
    <form
      action={formAction}
      className="admin-inline-form"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <input type="hidden" name="__resource" value={resourceKey} />
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__field" value={field.name} />
      <input type="hidden" name="__returnTo" value={returnTo} />
      <label htmlFor={inputId} className="sr-only">
        {field.label}
      </label>
      {field.type === "select" ? (
        <select
          ref={input}
          id={inputId}
          name="value"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          required={field.required}
          className="admin-input"
        >
          {field.required ? null : <option value="">{field.emptyOption ?? "—"}</option>}
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={input}
          id={inputId}
          name="value"
          type={INPUT_TYPES[field.type] ?? "text"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          required={field.required}
          className="admin-input"
        />
      )}
      <button type="submit" disabled={pending} className="boton-primario min-h-9 px-3 py-1 text-sm">
        {pending ? t("T-1427") : guardar}
      </button>
      <button type="button" onClick={cancel} className="boton-secundario min-h-9 px-3 py-1 text-sm">
        {cancelar}
      </button>
      {state.message && !state.ok ? (
        <p role="alert" className="w-full text-xs font-semibold text-oe-orange">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
