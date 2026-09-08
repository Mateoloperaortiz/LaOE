"use client";

import { useId, useState } from "react";
import { t } from "@/shared/copy";
import { type FieldDefinition, MULTI_SEPARATOR } from "./types";

const inputClass =
  "admin-input w-full min-w-0 rounded-xl border border-borde bg-fondo px-3 py-2.5 text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-titulo aria-[invalid=true]:border-oe-orange disabled:opacity-60";

type FieldProps = {
  field: FieldDefinition;
  value: string;
  error: string | undefined;
  editing: boolean;
  onChange(value: string): void;
};

export function ResourceMultiSelect({ field, value, error, editing, onChange }: FieldProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const selected = value ? value.split(MULTI_SEPARATOR) : [];
  const locked = editing && (field.lockedOnEdit ?? false);
  const options = field.options ?? [];
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("es");
  const matches = (label: string) => normalize(label).includes(normalize(query.trim()));
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-invalid={error ? true : undefined}
      aria-describedby={
        [field.help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") ||
        undefined
      }
      className="admin-field flex min-w-0 flex-col gap-2 rounded-xl border border-borde p-3"
    >
      <legend className="px-1 text-sm font-semibold">
        {field.label}
        {field.required ? (
          <span aria-hidden="true" className="ml-2 text-xs text-tinta-suave">
            {t("T-1430")}
          </span>
        ) : null}
      </legend>
      {options.length > 10 ? (
        <input
          type="search"
          value={query}
          disabled={locked}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={`${t("T-1428")} · ${field.label}`}
          placeholder={t("T-1428")}
          className={inputClass}
        />
      ) : null}
      <p className="text-xs text-tinta-suave" aria-live="polite">
        {t("T-1429", { n: selected.length })}
      </p>
      <div className="max-h-56 overflow-y-auto overscroll-contain">
        {options.map((option, index) => (
          <label
            key={option.value}
            htmlFor={`${id}-${index}`}
            hidden={!matches(option.label)}
            className={`${matches(option.label) ? "flex" : "hidden"} min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm has-checked:bg-fondo-suave`}
          >
            <input
              id={`${id}-${index}`}
              name={field.name}
              type="checkbox"
              value={option.value}
              checked={selected.includes(option.value)}
              disabled={locked}
              onChange={(event) =>
                onChange(
                  (event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value)
                  ).join(MULTI_SEPARATOR),
                )
              }
              className="size-5 shrink-0 accent-oe-navy"
            />
            <span>{option.label}</span>
          </label>
        ))}
        {options.every((option) => !matches(option.label)) ? (
          <p className="px-2 py-3 text-sm text-tinta-suave">
            {t(options.length === 0 ? "T-1435" : "T-1433")}
          </p>
        ) : null}
      </div>
      {locked
        ? selected.map((item) => <input key={item} type="hidden" name={field.name} value={item} />)
        : null}
      {field.help ? (
        <p id={`${id}-help`} className="text-xs text-tinta-suave">
          {field.help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-semibold text-tinta">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** La misma selección accesible del kit para formularios particulares con acciones de servidor. */
export function AdminMultiSelect({
  name,
  label,
  options,
  defaultValue = [],
  required = false,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string[];
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue.join(MULTI_SEPARATOR));
  return (
    <ResourceMultiSelect
      field={{ name, label, options, type: "multiselect", required }}
      value={value}
      error={undefined}
      editing={false}
      onChange={setValue}
    />
  );
}
