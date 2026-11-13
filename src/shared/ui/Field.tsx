import {
  Children,
  cloneElement,
  type InputHTMLAttributes,
  isValidElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircleIcon } from "@/shared/ui/icons/AlertCircleIcon";
import { ChevronDownIcon } from "@/shared/ui/icons/ChevronDownIcon";

// Campos de formulario de la capa funcional (ADR-163 regla 6, tramo R6-B).
// - `Field` pone la etiqueta, la ayuda y el error, y conecta el control con `aria-describedby` y
//   `aria-invalid`: el error va junto al campo, dice qué pasó y lleva icono además del color.
// - El control mide 44 px en Mi OE y 40 px en la Operación (`--alto-control`). En Mi OE es una
//   superficie con sombra; en la Operación, una línea. Lo resuelve la utilidad `campo`.
// Ningún componente trae textos: la etiqueta, la ayuda y el error llegan por props.

type Described = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

export function Field({
  id,
  label,
  help,
  error,
  children,
  className = "",
}: {
  /** El id del control, que también conecta la etiqueta. */
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const helpId = help ? `${id}-ayuda` : null;
  const errorId = error ? `${id}-error` : null;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`.trim()}>
      <label htmlFor={id} className="text-secundario font-semibold text-tinta">
        {label}
      </label>
      {Children.map(children, (child) => {
        if (!isValidElement<Described>(child) || child.props.id !== id) return child;
        const describedBy = [child.props["aria-describedby"], helpId, errorId]
          .filter(Boolean)
          .join(" ");
        return cloneElement(child, {
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
          ...(error ? { "aria-invalid": true } : {}),
        });
      })}
      {help ? (
        <p id={helpId ?? undefined} className="text-secundario text-tinta-secundaria">
          {help}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId ?? undefined}
          className="flex items-start gap-1.5 text-secundario font-medium text-error"
        >
          <span className="mt-0.5 shrink-0">
            <AlertCircleIcon size={16} />
          </span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

const CONTROL = "campo w-full min-w-0 px-3 text-cuerpo";

export function TextInput({
  className = "",
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={`${CONTROL} ${className}`.trim()} {...props} />;
}

export function TextArea({
  className = "",
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={`${CONTROL} py-2.5 leading-normal ${className}`.trim()}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative flex min-w-0 ${className}`.trim()}>
      <select className={`${CONTROL} appearance-none pr-10`} {...props}>
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-tinta-secundaria">
        <ChevronDownIcon size={16} />
      </span>
    </span>
  );
}
