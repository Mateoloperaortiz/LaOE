// Las piezas puras de «Hoy» (ADR-160 regla 2, tramo M2): qué le toca a la persona y en qué orden.
// Lo que se lee de la base vive en `today.ts`.

/** Lo que puede tocarle a la persona, en el orden de T-4891. */
export const TODO_KINDS = ["evidence", "availability", "call", "request"] as const;

export type TodoKind = (typeof TODO_KINDS)[number];

export interface TodoItem {
  id: string;
  kind: TodoKind;
  /** El nombre que completa el texto: el reto, el grupo o el tipo de solicitud. */
  subject: string;
  href: string;
  /** Hasta cuándo se puede: lo que vence antes va primero; sin fecha, al final. */
  due: Date | null;
}

/** Lo urgente arriba: por fecha límite, y lo que no tiene fecha después, en su orden de llegada. */
export function sortTodo(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.due && b.due) return a.due.getTime() - b.due.getTime();
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });
}
