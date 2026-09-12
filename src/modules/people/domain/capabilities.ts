import { z } from "zod";

// Capacidades de un cargo sobre su comité (ADR-058): vocabulario cerrado que el catálogo guarda por
// cargo y que la interfaz agrupa en áreas. La marca decide, no el nombre del cargo.

export const COMMITTEE_CAPABILITIES = [
  "ROSTER",
  "DIRECTION",
  "PERMANENCE",
  "OCCASIONS",
  "EVENTS",
  "BOARD",
  "PROFILE",
  "PARTNERS",
  "FINANCE",
] as const;

export type CommitteeCapability = (typeof COMMITTEE_CAPABILITIES)[number];

export const capabilitySchema = z.enum(COMMITTEE_CAPABILITIES);

/** Áreas de la vista del comité, en el orden de las pestañas (T-2174). */
export const COMMITTEE_AREAS = [
  { key: "personas", capabilities: ["ROSTER", "DIRECTION", "PERMANENCE"] },
  { key: "actividades", capabilities: ["OCCASIONS", "EVENTS"] },
  { key: "comunicacion", capabilities: ["BOARD", "PROFILE"] },
  { key: "aliados", capabilities: ["PARTNERS"] },
  { key: "finanzas", capabilities: ["FINANCE"] },
] as const satisfies ReadonlyArray<{
  key: string;
  capabilities: ReadonlyArray<CommitteeCapability>;
}>;

export type CommitteeArea = (typeof COMMITTEE_AREAS)[number]["key"];

/** Filtra lo que no está en el vocabulario y devuelve las capacidades sin repetir, en su orden. */
export function parseCapabilities(values: Iterable<string>): CommitteeCapability[] {
  const wanted = new Set(values);
  return COMMITTEE_CAPABILITIES.filter((capability) => wanted.has(capability));
}

export function hasCapability(granted: Iterable<string>, capability: CommitteeCapability): boolean {
  for (const item of granted) {
    if (item === capability) {
      return true;
    }
  }
  return false;
}

/** Las áreas donde el actor tiene al menos una capacidad, en el orden de las pestañas. */
export function areasFor(granted: Iterable<string>): CommitteeArea[] {
  const set = new Set(granted);
  return COMMITTEE_AREAS.filter((area) =>
    area.capabilities.some((capability) => set.has(capability)),
  ).map((area) => area.key);
}
