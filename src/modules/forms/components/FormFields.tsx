import type { FormField } from "@/modules/forms";

// Campos tipados de un formulario propio, pintados en el servidor con controles nativos (sin JS):
// los mismos en el formulario público, en el de miembros y en la inscripción a una convocatoria.

export interface FormFieldsProps {
  fields: FormField[];
  values?: Record<string, unknown>;
  errors?: Record<string, string>;
  labels: {
    required: string;
    multiHelp: string;
    dateHelp: string;
    /** Extremos de una calificación de 1 a 5 ("Muy mal · Excelente"). */
    rating?: [string, string];
  };
  /** Prefijo de los nombres de los campos (`f.` por defecto) para no chocar con nombre, apellido y correo. */
  prefix?: string;
  inputClass?: string;
}

const defaultInputClass =
  "w-full rounded-xl border border-borde bg-fondo px-3 py-2 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-oe-blue";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function FormFields({
  fields,
  values = {},
  errors = {},
  labels,
  prefix = "f.",
  inputClass = defaultInputClass,
}: FormFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => {
        const name = `${prefix}${field.key}`;
        const id = `campo-${field.key}`;
        const error = errors[field.key];
        const describedBy = [field.help ? `${id}-ayuda` : null, error ? `${id}-error` : null]
          .filter(Boolean)
          .join(" ");
        const label = (
          <span className="font-semibold">
            {field.label}
            {field.required ? <span aria-hidden="true"> *</span> : null}
          </span>
        );
        const help =
          field.help || field.type === "MULTISELECT" || field.type === "DATE" ? (
            <span id={`${id}-ayuda`} className="text-sm text-tinta-suave">
              {field.help ?? (field.type === "MULTISELECT" ? labels.multiHelp : labels.dateHelp)}
            </span>
          ) : null;
        const errorText = error ? (
          <span id={`${id}-error`} role="alert" className="text-sm font-semibold text-oe-orange">
            {error}
          </span>
        ) : null;
        if (field.type === "CHECKBOX") {
          return (
            <div key={field.key} className="flex flex-col gap-1">
              <label htmlFor={id} className="flex items-start gap-3">
                <input
                  id={id}
                  name={name}
                  type="checkbox"
                  defaultChecked={values[field.key] === true || values[field.key] === "on"}
                  aria-required={field.required || undefined}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={error ? true : undefined}
                  className="mt-1 size-5"
                />
                {label}
              </label>
              {help}
              {errorText}
            </div>
          );
        }
        if (field.type === "RATING") {
          const chosen = readString(values[field.key]) || String(values[field.key] ?? "");
          return (
            <fieldset
              key={field.key}
              className="flex flex-col gap-2"
              aria-describedby={describedBy || undefined}
            >
              <legend className="font-semibold">
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </legend>
              {help}
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                  {["1", "2", "3", "4", "5"].map((value) => (
                    <label
                      key={value}
                      htmlFor={`${id}-${value}`}
                      className="flex items-center gap-1"
                    >
                      <input
                        id={`${id}-${value}`}
                        name={name}
                        type="radio"
                        value={value}
                        defaultChecked={chosen === value}
                        required={field.required}
                        className="size-5"
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                {labels.rating ? (
                  <div className="flex max-w-[15rem] justify-between text-sm text-tinta-suave">
                    <span>{labels.rating[0]}</span>
                    <span>{labels.rating[1]}</span>
                  </div>
                ) : null}
              </div>
              {errorText}
            </fieldset>
          );
        }
        if (field.type === "MULTISELECT") {
          const chosen = readList(values[field.key]);
          return (
            <fieldset
              key={field.key}
              className="flex flex-col gap-2"
              aria-describedby={describedBy || undefined}
            >
              <legend className="font-semibold">
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </legend>
              {help}
              {(field.options ?? []).map((option) => {
                const optionId = `${id}-${option.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
                return (
                  <label key={option} htmlFor={optionId} className="flex items-center gap-3">
                    <input
                      id={optionId}
                      name={name}
                      type="checkbox"
                      value={option}
                      defaultChecked={chosen.includes(option)}
                      className="size-5"
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
              {errorText}
            </fieldset>
          );
        }
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <label htmlFor={id}>{label}</label>
            {help}
            {field.type === "TEXTAREA" ? (
              <textarea
                id={id}
                name={name}
                rows={5}
                required={field.required}
                defaultValue={readString(values[field.key])}
                aria-describedby={describedBy || undefined}
                aria-invalid={error ? true : undefined}
                className={inputClass}
              />
            ) : field.type === "SELECT" ? (
              <select
                id={id}
                name={name}
                required={field.required}
                defaultValue={readString(values[field.key])}
                aria-describedby={describedBy || undefined}
                aria-invalid={error ? true : undefined}
                className={inputClass}
              >
                <option value="">—</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={name}
                type={
                  field.type === "EMAIL"
                    ? "email"
                    : field.type === "PHONE"
                      ? "tel"
                      : field.type === "DATE"
                        ? "date"
                        : "text"
                }
                required={field.required}
                defaultValue={readString(values[field.key])}
                aria-describedby={describedBy || undefined}
                aria-invalid={error ? true : undefined}
                autoComplete={
                  field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : "off"
                }
                className={inputClass}
              />
            )}
            {errorText}
          </div>
        );
      })}
    </div>
  );
}
