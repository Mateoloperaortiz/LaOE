import type { ReactNode } from "react";

// Campos de los paneles de la Persona 360: mismas clases que el formulario del kit.

export const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="eyebrow text-xs">
        {label}
      </label>
      {children}
      {help ? <p className="text-xs text-tinta-suave">{help}</p> : null}
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
    <label htmlFor={id} className="flex items-start gap-3 text-sm">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-1 size-5 shrink-0 accent-oe-navy"
      />
      <span>{label}</span>
    </label>
  );
}

export function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5">
      <h3 className="eyebrow text-xs">{titulo}</h3>
      {children}
    </section>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="eyebrow text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="font-semibold">{valor ?? "—"}</dd>
    </div>
  );
}
