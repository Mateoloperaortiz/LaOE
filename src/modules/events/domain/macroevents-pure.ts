// Estructura confirmada por GH el 2026-09-14 (ADR-064).
export const MACROEVENT_SLUGS = ["inventiva", "enfemenino", "dias-eafit"] as const;

const COMMON_ROLES = [
  "GENERAL",
  "LOGISTICA",
  "FINANZAS",
  "RELACIONES_PUBLICAS",
  "MERCADEO",
  "GESTION_HUMANA",
] as const;

/** Los eventos sin especialidades conservan los seis cargos comunes. */
export function macroeventRoleCodes(slug: string): readonly string[] {
  if (slug === "enfemenino") return [...COMMON_ROLES, "AGENDA_ACADEMICA"];
  if (slug === "dias-eafit") return [...COMMON_ROLES, "SEGURIDAD", "CARNIVAL", "THE_GAMES"];
  return COMMON_ROLES;
}

export function isMacroeventSlug(slug: string): boolean {
  return MACROEVENT_SLUGS.some((value) => value === slug);
}
