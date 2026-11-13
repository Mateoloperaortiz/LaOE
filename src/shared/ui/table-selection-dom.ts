// Las casillas de selección de una tabla de trabajo pertenecen a un formulario por su atributo `form`, no
// por estar adentro de él. `form.elements` las trae a todas, estén donde estén (tramo R6-B).

export function rowCheckboxes(formId: string, name: string): HTMLInputElement[] {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) return [];
  return Array.from(form.elements).filter(
    (element): element is HTMLInputElement =>
      element instanceof HTMLInputElement &&
      element.type === "checkbox" &&
      element.name === name &&
      element.hasAttribute("data-row-select"),
  );
}

/** Un `change` de una casilla no sube hasta su formulario si no está adentro: se escucha en el documento. */
export function onSelectionChange(formId: string, listener: () => void): () => void {
  const handler = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.form?.id === formId) listener();
  };
  document.addEventListener("change", handler);
  return () => document.removeEventListener("change", handler);
}
