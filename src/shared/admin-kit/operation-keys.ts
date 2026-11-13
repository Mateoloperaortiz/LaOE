import type { AdminSpaceIcon } from "@/shared/admin-kit/navigation";

// Los atajos de la Operación (ADR-167 regla 1, plan maestro anexo A): qué hace cada tecla, sin el DOM,
// para que se puedan probar solas. El componente `OperationShortcuts` las escucha y las ejecuta.

/** La letra de cada espacio después de G. La Mesa y el Inicio no son espacios, pero también van. */
export const SPACE_KEYS: Record<AdminSpaceIcon | "mesa" | "inicio", string> = {
  mesa: "m",
  inicio: "i",
  personas: "p",
  comites: "c",
  admision: "a",
  comunicacion: "o",
  participacion: "t",
  permanencia: "r",
  finanzas: "f",
  macroeventos: "e",
  junta: "j",
  sistema: "s",
};

export type OperationCommand =
  | { kind: "map" }
  | { kind: "go-prefix" }
  | { kind: "go"; key: string }
  | { kind: "create" }
  | { kind: "search" }
  | { kind: "edit" }
  | { kind: "save" };

type KeyInput = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

/** Dónde está el foco: escribiendo, dentro de un diálogo o en la página. */
export type FocusPlace = "typing" | "dialog" | "page";

/**
 * Qué atajo es una tecla. `pendingGo` dice que la anterior fue la G de «ir a». Mientras se escribe solo
 * vale ⌘Enter (guardar), y con un diálogo abierto solo ese: el diálogo tiene sus teclas.
 */
export function operationCommand(
  event: KeyInput,
  place: FocusPlace,
  pendingGo: boolean,
): OperationCommand | null {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    // Guardar vale también dentro del panel de edición, que es un diálogo.
    return { kind: "save" };
  }
  if (place !== "page" || event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (pendingGo) {
    return Object.values(SPACE_KEYS).includes(key) ? { kind: "go", key } : null;
  }
  switch (event.key) {
    case "?":
      return { kind: "map" };
    case "/":
      return { kind: "search" };
    default:
      break;
  }
  switch (key) {
    case "g":
      return { kind: "go-prefix" };
    case "c":
      return { kind: "create" };
    case "e":
      return { kind: "edit" };
    default:
      return null;
  }
}
