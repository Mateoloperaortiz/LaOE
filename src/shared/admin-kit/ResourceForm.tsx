"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { ResourceMultiSelect } from "./AdminMultiSelect";
import type { FieldDefinition, FormState } from "./types";

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
  "admin-input w-full min-w-0 rounded-xl border border-borde bg-fondo px-3 py-2.5 text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-titulo aria-[invalid=true]:border-oe-orange disabled:opacity-60";

type FieldProps = {
  field: FieldDefinition;
  value: string;
  error: string | undefined;
  editing: boolean;
  onChange(value: string): void;
};

function Field(props: FieldProps) {
  const { field, value, error, editing, onChange } = props;
  const id = useId();
  const locked = editing && (field.lockedOnEdit ?? false);
  const common = {
    id,
    name: field.name,
    required: field.required ?? false,
    "aria-invalid": error ? true : undefined,
    "aria-describedby":
      [field.help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") ||
      undefined,
  };
  if (field.type === "multiselect") return <ResourceMultiSelect {...props} />;

  let control: React.ReactNode;
  if (field.type === "textarea") {
    control = (
      <textarea
        {...common}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={locked}
        rows={field.rows ?? 5}
        className={`${inputClass} ${field.textVariant === "code" ? "font-mono text-sm" : "font-sans"}`}
      />
    );
  } else if (field.type === "select") {
    control = (
      <>
        <select
          {...common}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={locked}
          className={inputClass}
        >
          <option value="">{field.emptyOption ?? "—"}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {locked ? <input type="hidden" name={field.name} value={value} /> : null}
      </>
    );
  } else if (field.type === "checkbox") {
    control = (
      <>
        <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            {...common}
            type="checkbox"
            checked={value === "true" || value === "on"}
            onChange={(event) => onChange(String(event.target.checked))}
            disabled={locked}
            className="size-5 shrink-0 accent-oe-navy"
          />
          <span>{field.label}</span>
        </label>
        {locked ? <input type="hidden" name={field.name} value={value} /> : null}
      </>
    );
  } else {
    const type =
      field.type === "datetime" ? "datetime-local" : field.type === "color" ? "text" : field.type;
    control = (
      <input
        {...common}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={locked}
        placeholder={field.type === "color" ? "#94B6F0" : field.placeholder}
        pattern={field.type === "color" ? "#[0-9a-fA-F]{6}" : undefined}
        className={inputClass}
      />
    );
  }
  return (
    <div className="admin-field flex min-w-0 flex-col gap-2">
      {field.type !== "checkbox" ? (
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
          <label htmlFor={id}>{field.label}</label>
          {field.required ? (
            <span aria-hidden="true" className="text-xs font-normal text-tinta-suave">
              {t("T-1430")}
            </span>
          ) : null}
        </div>
      ) : null}
      {control}
      {field.help ? (
        <p id={`${id}-help`} className="text-xs text-tinta-suave">
          {field.help}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="rounded-lg border-l-2 border-oe-orange bg-fondo-suave px-3 py-2 text-sm font-semibold"
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
  const form = useRef<HTMLFormElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState(initialValues);
  // Los campos son controlados: si la acción no responde, lo escrito sigue en `values` (ADR-118 regla 20).
  const [state, formAction, pending] = useGuardedActionState(
    action,
    { ok: false, message: null, errors: {}, values: initialValues },
    ({ previous, message }) => ({ ...previous, ok: false, message, errors: {} }),
  );
  // React reinicia el formulario cuando su acción termina, y un `<select>` controlado queda mostrando su
  // primera opción aunque `values` conserve la elegida: el reintento mandaría la lista vacía. Volver a
  // fijar los valores repinta los campos antes de que se vea (ADR-118 regla 20).
  useLayoutEffect(() => {
    if (!state.message) return;
    setValues((current) => ({ ...current }));
  }, [state]);
  useEffect(() => {
    if (!state.message) return;
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? feedback.current)?.focus();
  }, [state]);
  return (
    <ActionForm
      ref={form}
      action={formAction}
      aria-busy={pending}
      className="admin-resource-form flex min-w-0 flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <input type="hidden" name="__resource" value={resourceKey} />
      <input type="hidden" name="__id" value={id ?? ""} />
      <input type="hidden" name="__returnTo" value={returnTo} />
      {state.message ? (
        <div
          ref={feedback}
          tabIndex={-1}
          role="alert"
          className="admin-feedback rounded-xl border border-oe-orange bg-fondo-suave px-4 py-3 text-sm font-semibold"
        >
          {state.message}
        </div>
      ) : null}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5 disabled:opacity-70">
        {fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            error={state.errors[field.name]}
            editing={id !== null}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        ))}
      </fieldset>
      <div className="admin-form-actions sticky bottom-0 mt-auto flex flex-wrap items-center gap-3 border-t border-borde bg-fondo pt-4 pb-2">
        <button
          type="submit"
          disabled={pending}
          className="boton-calido min-h-11 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? t("T-1427") : labels.save}
        </button>
        <Link
          href={cancelHref}
          replace
          scroll={false}
          aria-disabled={pending}
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
          className="boton-secundario min-h-11 aria-disabled:opacity-60"
        >
          {labels.cancel}
        </Link>
        <output className="sr-only">{pending ? t("T-1427") : ""}</output>
      </div>
    </ActionForm>
  );
}
