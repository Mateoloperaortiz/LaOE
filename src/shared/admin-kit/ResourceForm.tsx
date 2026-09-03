"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type FieldDefinition, type FormState, MULTI_SEPARATOR } from "./types";

export type SaveAction = (previous: FormState, formData: FormData) => Promise<FormState>;

type Props = {
  resourceKey: string;
  id: string | null;
  returnTo: string;
  fields: FieldDefinition[];
  initialValues: Record<string, string>;
  action: SaveAction;
  cancelHref: string;
  labels: { save: string; cancel: string };
};

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none aria-[invalid=true]:border-oe-orange";

function Field({
  field,
  value,
  error,
  editing,
}: {
  field: FieldDefinition;
  value: string;
  error: string | undefined;
  editing: boolean;
}) {
  const id = `campo-${field.name}`;
  const locked = editing && (field.lockedOnEdit ?? false);
  const common = {
    id,
    name: field.name,
    required: field.required ?? false,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : field.help ? `${id}-help` : undefined,
    readOnly: locked,
  };
  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = (
        <textarea
          {...common}
          defaultValue={value}
          rows={field.rows ?? 5}
          className={`${inputClass} font-mono text-sm`}
        />
      );
      break;
    case "select":
      control = (
        <select {...common} defaultValue={value} disabled={locked} className={inputClass}>
          <option value="">{field.emptyOption ?? "—"}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    case "multiselect":
      control = (
        <select
          {...common}
          multiple
          defaultValue={value ? value.split(MULTI_SEPARATOR) : []}
          disabled={locked}
          size={Math.min(8, Math.max(3, (field.options ?? []).length))}
          className={inputClass}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
      break;
    case "checkbox":
      control = (
        <input
          {...common}
          type="checkbox"
          defaultChecked={value === "true" || value === "on"}
          className="size-5 accent-oe-navy"
        />
      );
      break;
    case "number":
      control = <input {...common} type="number" defaultValue={value} className={inputClass} />;
      break;
    case "date":
      control = <input {...common} type="date" defaultValue={value} className={inputClass} />;
      break;
    case "datetime":
      control = (
        <input {...common} type="datetime-local" defaultValue={value} className={inputClass} />
      );
      break;
    case "color":
      control = (
        <input
          {...common}
          type="text"
          defaultValue={value}
          placeholder="#94B6F0"
          pattern="#[0-9a-fA-F]{6}"
          className={inputClass}
        />
      );
      break;
    default:
      control = (
        <input
          {...common}
          type={field.type === "url" ? "url" : field.type === "email" ? "email" : "text"}
          defaultValue={value}
          placeholder={field.placeholder}
          className={inputClass}
        />
      );
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="eyebrow text-xs">
        {field.label}
      </label>
      {control}
      {field.help && !error ? (
        <p id={`${id}-help`} className="text-xs text-tinta-suave">
          {field.help}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="rounded-lg bg-oe-orange px-2 py-1 text-xs font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ResourceForm({
  resourceKey,
  id,
  returnTo,
  fields,
  initialValues,
  action,
  cancelHref,
  labels,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {
    ok: false,
    message: null,
    errors: {},
    values: initialValues,
  });
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="__resource" value={resourceKey} />
      <input type="hidden" name="__id" value={id ?? ""} />
      <input type="hidden" name="__returnTo" value={returnTo} />
      {state.message ? (
        <output className="block rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy">
          {state.message}
        </output>
      ) : null}
      {fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={state.values[field.name] ?? ""}
          error={state.errors[field.name]}
          editing={id !== null}
        />
      ))}
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
          {labels.save}
        </button>
        <Link href={cancelHref} className="boton-secundario">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
