import type { InputHTMLAttributes, ReactNode } from "react";

// Casillas, interruptores y opciones de la capa funcional (tramo R6-B). La etiqueta envuelve el control,
// así que toda la fila se toca, y mide al menos el alto de un control (`--alto-control`). Los tres son
// controles nativos: funcionan sin JavaScript y con el teclado de siempre.

const ROW = "flex min-h-(--alto-control) cursor-pointer items-start gap-3 py-2.5 text-cuerpo";
const BOX = "mt-0.5 size-5 shrink-0 accent-[var(--accion)]";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  label: ReactNode;
  help?: ReactNode;
};

function Text({
  label,
  help,
  id,
}: {
  label: ReactNode;
  help?: ReactNode;
  id?: string | undefined;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span>{label}</span>
      {help ? (
        <span id={id ? `${id}-ayuda` : undefined} className="text-secundario text-tinta-secundaria">
          {help}
        </span>
      ) : null}
    </span>
  );
}

export function Checkbox({ label, help, className = "", ...props }: BaseProps) {
  return (
    <label className={`${ROW} ${className}`.trim()}>
      <input
        type="checkbox"
        aria-describedby={help && props.id ? `${props.id}-ayuda` : undefined}
        className={BOX}
        {...props}
      />
      <Text label={label} help={help} id={props.id} />
    </label>
  );
}

/**
 * Interruptor: una casilla con `role="switch"`, para lo que se prende y se apaga al instante, como un
 * aviso. El riel apagado usa el texto secundario para que se distinga del fondo con 3:1 o más.
 */
export function Switch({ label, help, className = "", ...props }: BaseProps) {
  return (
    <label className={`${ROW} justify-between ${className}`.trim()}>
      <Text label={label} help={help} id={props.id} />
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          // biome-ignore lint/a11y/useAriaPropsForRole: una casilla nativa con role="switch" expone su estado con `checked`; un aria-checked fijo mentiría al tocarla.
          role="switch"
          aria-describedby={help && props.id ? `${props.id}-ayuda` : undefined}
          className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none size-full rounded-full bg-tinta-secundaria transition-colors peer-checked:bg-accion peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-oe-orange peer-disabled:opacity-60"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-superficie transition-transform peer-checked:translate-x-5 motion-reduce:transition-none"
        />
      </span>
    </label>
  );
}

export function RadioGroup({
  legend,
  name,
  options,
  defaultValue,
  className = "",
}: {
  legend: ReactNode;
  name: string;
  options: { value: string; label: ReactNode; help?: ReactNode }[];
  defaultValue?: string;
  className?: string;
}) {
  return (
    <fieldset className={`flex min-w-0 flex-col gap-1 border-0 p-0 ${className}`.trim()}>
      <legend className="mb-1 text-secundario font-semibold text-tinta">{legend}</legend>
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <label key={option.value} className={ROW}>
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              aria-describedby={option.help ? `${id}-ayuda` : undefined}
              className={BOX}
            />
            <Text label={option.label} help={option.help} id={id} />
          </label>
        );
      })}
    </fieldset>
  );
}
