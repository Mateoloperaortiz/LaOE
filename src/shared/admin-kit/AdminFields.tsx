import { Children, cloneElement, isValidElement, type ReactNode } from "react";

export const inputClass =
  "w-full min-w-0 rounded-lg border border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none focus-visible:ring-2 focus-visible:ring-titulo/20";

export function Campo({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {Children.map(children, (child) => {
        if (
          !help ||
          !isValidElement<{ id?: string; "aria-describedby"?: string }>(child) ||
          child.props.id !== id
        ) {
          return child;
        }
        return cloneElement(child, {
          "aria-describedby": [child.props["aria-describedby"], `${id}-help`]
            .filter(Boolean)
            .join(" "),
        });
      })}
      {help ? (
        <p id={`${id}-help`} className="text-sm text-tinta-suave">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function Casilla({
  id,
  name,
  label,
  defaultChecked = false,
  disabled = false,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-10 items-start gap-3 text-sm">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-5 shrink-0 accent-oe-navy"
      />
      <span>{label}</span>
    </label>
  );
}

export function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-borde bg-fondo p-4 sm:p-5">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="break-words text-sm font-medium">{valor ?? "—"}</dd>
    </div>
  );
}
