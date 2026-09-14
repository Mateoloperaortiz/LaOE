import type { TimelineFilter } from "@/modules/crm";
import { tList } from "@/shared/copy";

// Etiquetas compartidas por la cabecera, las pestañas y los paneles de la Persona 360.

export const TABS = [
  "resumen",
  "linea",
  "membresia",
  "participacion",
  "permanencia",
  "formularios",
  "comunicaciones",
  "tareas",
  "solicitudes",
  "datos",
] as const;

export type Tab = (typeof TABS)[number];

export function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

export function tabLabels(): Record<Tab, string> {
  const names = tList("T-432");
  return Object.fromEntries(TABS.map((tab, index) => [tab, names[index] ?? tab])) as Record<
    Tab,
    string
  >;
}

export const END_REASONS = [
  "GRADUATION",
  "RESIGNATION",
  "PERMANENCE",
  "EXPULSION",
  "STUDENT_STATUS_LOST",
  "OTHER",
] as const;

export const CONSENT_TEXTS = ["T-150", "T-151", "T-152", "T-153", "T-154"] as const;

/** Filtros de la línea de tiempo en el orden de T-454; "OTHER" agrupa cargos, permisos y otros; "PARTICIPATION" llega en la fase 3 y los cuatro últimos en la fase 5. */
export const TIMELINE_FILTERS = [
  "ALL",
  "NOTE",
  "MEMBERSHIP",
  "COMMITTEES",
  "CONSENT",
  "DATA",
  "IMPORTED",
  "OTHER",
  "PARTICIPATION",
  "FORM",
  "PIPELINE",
  "REQUEST",
  "CALL",
] as const satisfies readonly TimelineFilter[];

export type TimelineFilterKey = (typeof TIMELINE_FILTERS)[number];

export function isTimelineFilter(value: string): value is TimelineFilterKey {
  return (TIMELINE_FILTERS as readonly string[]).includes(value);
}
