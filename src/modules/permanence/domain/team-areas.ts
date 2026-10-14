import { tLabels } from "@/shared/copy";

const COMMON = [
  "GENERAL",
  "PUBLICIDAD",
  "LOGISTICA",
  "FINANZAS",
  "RELACIONES_PUBLICAS",
  "MERCADEO",
  "GESTION_HUMANA",
] as const;
export const TEAM_AREA_CODES = [
  ...COMMON,
  "AGENDA_ACADEMICA",
  "SEGURIDAD",
  "CARNIVAL",
  "THE_GAMES",
] as const;

/** Áreas de trabajo independientes de los cargos de dirección (ADR-065). */
export function macroeventAreas(slug: string) {
  const extra =
    slug === "enfemenino"
      ? ["AGENDA_ACADEMICA"]
      : slug === "dias-eafit"
        ? ["SEGURIDAD", "CARNIVAL", "THE_GAMES"]
        : [];
  return TEAM_AREA_CODES.filter(
    (code) => COMMON.some((item) => item === code) || extra.includes(code),
  ).map((code) => ({ code, label: teamAreaLabel(code) }));
}

export function teamAreaLabel(code: string): string {
  const labels: Readonly<Record<string, string>> = tLabels("T-2376", TEAM_AREA_CODES);
  return labels[code] ?? code;
}
