// Inhabilidades y topes de cargos (Regl. art. 11 y 27; ADR-060 regla 11), sin I/O: qué impide nombrar
// a alguien en un cargo directivo de comité o de macroevento en un término.

type HeldRoleKind = "COMMITTEE" | "MACROEVENT";

/** Un cargo directivo vivo: de comité (`scopeId` = comité) o de macroevento (`scopeId` = edición). */
export interface HeldRole {
  kind: HeldRoleKind;
  scopeId: string;
  roleCode: string;
  coDirector: boolean;
}

/** En el orden de T-2281. */
export const INHABILITY_CODES = [
  "OFFICE_BAN",
  "BOARD",
  "NEW_MEMBER",
  "TWO_MACROEVENTS",
  "TWO_GENERAL",
  "TWO_FINANCIERO",
  "MAX_ROLES",
  "NEEDS_CODIRECTION",
] as const;

export type InhabilityCode = (typeof INHABILITY_CODES)[number];

/** Nadie supera dos cargos directivos vivos en el término (Regl. art. 27 par. 3). */
const MAX_LEADERSHIP_ROLES = 2;

export interface InhabilityInput {
  /** Cargos vivos que se conservan (sin los del ámbito que se está reemplazando). */
  existing: readonly HeldRole[];
  /** Cargos que se quieren nombrar. */
  wanted: readonly HeldRole[];
  /** Se quiere nombrar en la Junta Directiva (art. 11: junta y mesa no conviven). */
  wantsBoard?: boolean;
  hasBoardAppointment: boolean;
  /** Nuevo en el término (sin reportarse como activo): sin cargo de mesa salvo aval (art. 27.1 y par. 1). */
  isNew: boolean;
  /** Inhabilidad viva para cargos (Anexo 1). */
  officeBan: boolean;
}

function scopesWith(all: readonly HeldRole[], roleCode: string): number {
  return new Set(
    all
      .filter((role) => role.kind === "COMMITTEE" && role.roleCode === roleCode)
      .map((r) => r.scopeId),
  ).size;
}

/** Todas las inhabilidades que impiden el nombramiento, en el orden de T-2281; vacío si se puede. */
export function inhabilities(input: InhabilityInput): InhabilityCode[] {
  const all = [...input.existing, ...input.wanted];
  const wantsCommittee = input.wanted.some((role) => role.kind === "COMMITTEE");
  const codes: InhabilityCode[] = [];
  if (input.officeBan && (input.wantsBoard || input.wanted.length > 0)) {
    codes.push("OFFICE_BAN");
  }
  if (input.wantsBoard) {
    if (all.some((role) => role.kind === "COMMITTEE")) {
      codes.push("BOARD");
    }
    if (input.wanted.length === 0) {
      return codes;
    }
  }
  if (input.wanted.length === 0) {
    return [];
  }
  if (input.hasBoardAppointment && wantsCommittee && !codes.includes("BOARD")) {
    codes.push("BOARD");
  }
  if (input.isNew && wantsCommittee) {
    codes.push("NEW_MEMBER");
  }
  const macroevents = new Set(
    all.filter((role) => role.kind === "MACROEVENT").map((role) => role.scopeId),
  );
  if (macroevents.size > 1) {
    codes.push("TWO_MACROEVENTS");
  }
  if (scopesWith(all, "GENERAL") > 1) {
    codes.push("TWO_GENERAL");
  }
  if (scopesWith(all, "FINANCIERO") > 1) {
    codes.push("TWO_FINANCIERO");
  }
  if (all.length > MAX_LEADERSHIP_ROLES) {
    codes.push("MAX_ROLES");
  } else if (all.length === MAX_LEADERSHIP_ROLES && !all.some((role) => role.coDirector)) {
    codes.push("NEEDS_CODIRECTION");
  }
  return codes;
}

/** Las etiquetas de esos códigos, en orden; `labels` trae la de cada código de T-2281 por valor. */
export function inhabilityLabels(
  codes: readonly InhabilityCode[],
  labels: Readonly<Record<string, string>>,
): string[] {
  return codes.map((code) => labels[code] ?? code);
}
