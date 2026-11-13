"use client";

import { useEffect, useRef, useState } from "react";
import { type SelectionState, selectionState } from "@/shared/ui/list-navigation";
import { onSelectionChange, rowCheckboxes } from "@/shared/ui/table-selection-dom";

// «Seleccionar todas» de una tabla de trabajo (tramo R6-B). Marca o desmarca las casillas de su
// formulario y queda a medias (`indeterminate`) cuando hay algunas marcadas.

export function TableSelectAll({
  form,
  name,
  label,
}: {
  form: string;
  name: string;
  label: string;
}) {
  const box = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SelectionState>("none");

  useEffect(() => {
    const update = () => {
      const boxes = rowCheckboxes(form, name);
      setState(selectionState(boxes.filter((item) => item.checked).length, boxes.length));
    };
    update();
    return onSelectionChange(form, update);
  }, [form, name]);

  useEffect(() => {
    if (box.current) box.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={box}
      type="checkbox"
      aria-label={label}
      checked={state === "all"}
      onChange={() => {
        const select = state !== "all";
        for (const item of rowCheckboxes(form, name)) {
          if (item.checked === select) continue;
          item.checked = select;
          item.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }}
      className="size-4 accent-[var(--accion)]"
    />
  );
}
