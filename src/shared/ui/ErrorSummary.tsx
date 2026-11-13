import type { ReactNode } from "react";
import { AlertCircleIcon } from "@/shared/ui/icons/AlertCircleIcon";

// Resumen de errores de un formulario (tramo R6-B). Va arriba del formulario cuando el envío falla: se
// anuncia como alerta y cada error lleva al campo que hay que corregir. Cada campo repite su error al
// lado (`Field`), así que el resumen solo orienta.

export function ErrorSummary({
  id,
  title,
  errors,
  className = "",
}: {
  /** Para mover el foco al resumen después de un envío fallido. */
  id?: string;
  title: ReactNode;
  errors: { field: string; message: ReactNode }[];
  className?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <div
      id={id}
      role="alert"
      tabIndex={-1}
      className={`flex items-start gap-3 rounded-control bg-error-fondo p-4 text-tinta outline-none ${className}`.trim()}
    >
      <span className="mt-0.5 text-error">
        <AlertCircleIcon size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-semibold text-error">{title}</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {errors.map((error) => (
            <li key={error.field}>
              <a
                href={`#${error.field}`}
                className="font-medium text-tinta underline underline-offset-4"
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
