// Lógica pura de la selección y los atajos de una lista (ADR-159 regla 5, tramo R6-B). Vive aparte de
// los componentes para probarla sin navegador.

export type SelectionState = "none" | "some" | "all";

/** Cuántas casillas marcadas de cuántas: nada, algunas o todas. Una lista vacía no está «toda». */
export function selectionState(checked: number, total: number): SelectionState {
  if (checked <= 0 || total <= 0) return "none";
  return checked >= total ? "all" : "some";
}

/** El texto de la cuenta, con `{n}` en la forma que toque: «1 seleccionada», «3 seleccionadas». */
export function formatCount(count: number, label: { one: string; other: string }): string {
  return (count === 1 ? label.one : label.other).replaceAll("{n}", String(count));
}

export type ListCommand = "next" | "previous" | "toggle";

const TEXT_INPUTS = new Set([
  "",
  "text",
  "search",
  "email",
  "number",
  "password",
  "tel",
  "url",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** Si el foco está escribiendo: un atajo de una letra no puede robarle la tecla. */
export function isTextEntry(target: {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}): boolean {
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has((target.type ?? "").toLowerCase());
  return false;
}

/**
 * La orden de una tecla en una lista: J baja, K sube y X marca la fila. Ninguna actúa con una tecla
 * modificadora ni mientras se escribe (ADR-159 regla 5).
 */
export function listCommand(
  event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
  target: { tagName?: string; type?: string; isContentEditable?: boolean },
): ListCommand | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isTextEntry(target)) return null;
  switch (event.key) {
    case "j":
    case "J":
      return "next";
    case "k":
    case "K":
      return "previous";
    case "x":
    case "X":
      return "toggle";
    default:
      return null;
  }
}

/** La fila a la que se va: sin fila actual, J entra por la primera y K por la última; no da la vuelta. */
export function moveIndex(current: number, total: number, command: "next" | "previous"): number {
  if (total <= 0) return -1;
  if (current < 0) return command === "next" ? 0 : total - 1;
  return command === "next" ? Math.min(current + 1, total - 1) : Math.max(current - 1, 0);
}
