// Las piezas puras de la Mesa (ADR-159 regla 3, tramo O2): los grupos en su orden, a dónde lleva cada
// elemento y cuántos pendientes suma. Lo que se lee de la base vive en `desk.ts`.

/** Los grupos de la Mesa en el orden de T-4866. */
export const DESK_SECTIONS = [
  "tasks",
  "requests",
  "excuses",
  "reviews",
  "evaluations",
  "alerts",
] as const;

export type DeskSectionKey = (typeof DESK_SECTIONS)[number];

/** Las fechas que acompañan un elemento en el orden de T-4871: cuándo vence, que ya venció o cuándo llegó. */
export const DESK_DATE_KINDS = ["due", "overdue", "arrived"] as const;

export type DeskDate = { kind: (typeof DESK_DATE_KINDS)[number]; at: Date };

export interface DeskItem {
  id: string;
  title: string;
  detail: string | null;
  href: string;
  date: DeskDate | null;
}

export interface DeskSection {
  key: DeskSectionKey;
  /** Todos los pendientes del grupo, aunque solo se muestren los primeros. */
  total: number;
  /** La pantalla de origen con la lista completa, si es una sola. */
  href: string | null;
  items: DeskItem[];
}

export interface Desk {
  total: number;
  sections: DeskSection[];
}

/** Cuántos elementos muestra cada grupo; el resto queda detrás de «Ver los {n}». */
export const DESK_ROWS = 6;

export interface DeskTaskRef {
  id: string;
  kind: string;
  personId: string | null;
  organizationId: string | null;
}

/** A dónde lleva una tarea: la solicitud que la originó, la ficha de su persona u organización, o la lista. */
export function taskHref(row: DeskTaskRef): string {
  if (row.kind === "REQUEST") {
    return `/admin/solicitudes?tarea=${row.id}`;
  }
  if (row.personId) {
    return `/admin/personas/${row.personId}`;
  }
  if (row.organizationId) {
    return `/admin/organizaciones/${row.organizationId}`;
  }
  return "/admin/tareas";
}

/** La fecha de una tarea: vence o venció según su límite; sin límite no lleva fecha. */
export function taskDate(dueAt: Date | null, now: Date): DeskDate | null {
  if (!dueAt) {
    return null;
  }
  return { kind: dueAt.getTime() < now.getTime() ? "overdue" : "due", at: dueAt };
}

/** Arma un grupo; sin pendientes no hay grupo, para que la Mesa vacía se vea vacía. */
export function deskSection(
  key: DeskSectionKey,
  total: number,
  items: DeskItem[],
  href: string | null,
): DeskSection[] {
  return total > 0 ? [{ key, total, href, items: items.slice(0, DESK_ROWS) }] : [];
}

/** La Mesa con sus grupos en el orden de T-4866 y la suma que muestra el contador de la barra. */
export function composeDesk(sections: DeskSection[]): Desk {
  const ordered = [...sections].sort(
    (a, b) => DESK_SECTIONS.indexOf(a.key) - DESK_SECTIONS.indexOf(b.key),
  );
  return { total: ordered.reduce((sum, section) => sum + section.total, 0), sections: ordered };
}
