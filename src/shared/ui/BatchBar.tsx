"use client";

import { type ReactNode, useEffect, useState } from "react";
import { formatCount } from "@/shared/ui/list-navigation";
import { onSelectionChange, rowCheckboxes } from "@/shared/ui/table-selection-dom";

// Barra de acciones en lote de la tabla de trabajo (ADR-159 regla 5, ADR-163 regla 8; tramo R6-B).
// Es el formulario al que pertenecen las casillas de la tabla: sus botones envían los ids marcados con
// la misma orden y la misma auditoría de siempre. Se ve solo con algo marcado, y la cuenta se anuncia.
// Los botones van con `onFloating`, porque la barra es una superficie que flota.

export function BatchBar({
  form,
  name,
  countLabel,
  action,
  children,
}: {
  form: string;
  name: string;
  /** El texto de la cuenta con `{n}`: «{n} seleccionada» y «{n} seleccionadas». */
  countLabel: { one: string; other: string };
  /** La acción por defecto del formulario; cada botón puede llevar la suya con `formAction`. */
  action?: string | ((formData: FormData) => void | Promise<void>);
  children: ReactNode;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(rowCheckboxes(form, name).filter((item) => item.checked).length);
    update();
    return onSelectionChange(form, update);
  }, [form, name]);

  return (
    <form id={form} action={action} className="sticky bottom-4 z-20">
      <div
        hidden={count === 0}
        className="superficie-flotante flex flex-wrap items-center gap-2 rounded-tarjeta py-2 pr-2 pl-4"
      >
        <output className="flex-1 font-semibold">
          {count > 0 ? formatCount(count, countLabel) : ""}
        </output>
        {children}
      </div>
    </form>
  );
}
