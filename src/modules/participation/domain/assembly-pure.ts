// Requisito de asambleas por persona y término (ADR-024, ADR-028, ADR-035 regla 12): derivado del
// término salvo ajuste individual; el cumplimiento se calcula, nunca se persiste.

import type { AssemblyKind, OccasionStatus } from "./occasion-pure";

export interface AssemblyRequirementView {
  requiredOrdinary: number;
  requiresBoardElection: boolean;
  requiresRunoff: boolean;
  /** Viene de un ajuste de ADMIN con motivo. */
  adjusted: boolean;
  reason: string | null;
}

/**
 * Una ordinaria por defecto; la elección de junta y la segunda vuelta se exigen cuando existen en el
 * término, en cualquier semestre (Regl. art. 60 y 63; Est. art. 7.9; ADR-060 regla 13). Privada de
 * este archivo: el requisito «del término» se pide por `termAssemblyRequirement` (ADR-123 regla 13).
 */
function defaultRequirement(
  term: { requiredOrdinaryAssemblies: number },
  existing: { hasBoardElection: boolean; hasRunoff: boolean },
): AssemblyRequirementView {
  return {
    requiredOrdinary: term.requiredOrdinaryAssemblies,
    requiresBoardElection: existing.hasBoardElection,
    requiresRunoff: existing.hasRunoff,
    adjusted: false,
    reason: null,
  };
}

/**
 * El requisito «del término», el de quien no tiene un ajuste: el único sitio que lo deriva de las
 * ocasiones (ADR-123 regla 13). Recibe las ocasiones del término, todas o solo sus asambleas: una
 * especial cancelada no exige nada, y solo una asamblea lleva `assemblyKind` (check
 * `occasion_assembly_kind_consistent`), así que responde lo mismo con unas que con otras.
 */
export function termAssemblyRequirement(
  term: { requiredOrdinaryAssemblies: number },
  occasions: readonly { assemblyKind: AssemblyKind | null; status: OccasionStatus }[],
): AssemblyRequirementView {
  const exists = (kind: AssemblyKind) =>
    occasions.some((item) => item.assemblyKind === kind && item.status !== "CANCELLED");
  return defaultRequirement(term, {
    hasBoardElection: exists("BOARD_ELECTION"),
    hasRunoff: exists("RUNOFF"),
  });
}

export interface AttendedAssembly {
  assemblyKind: AssemblyKind;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXCUSED";
}

export interface AssemblyCompliance {
  ordinaryAttended: number;
  boardElectionAttended: boolean;
  runoffAttended: boolean;
  compliant: boolean;
  /** Qué falta, en el orden de T-546: ORDINARY, BOARD_ELECTION, RUNOFF. */
  missing: AssemblyKind[];
  /** Asistencias aprobadas de cualquier tipo: alimentan el criterio del 10 % (fase 4). */
  attendedTotal: number;
}

export function assemblyCompliance(
  requirement: AssemblyRequirementView,
  attended: ReadonlyArray<AttendedAssembly>,
): AssemblyCompliance {
  const approved = attended.filter((item) => item.status === "APPROVED");
  const excused = attended.filter((item) => item.status === "EXCUSED");
  const ordinaryAttended = approved.filter((item) => item.assemblyKind === "ORDINARY").length;
  const boardElectionAttended = approved.some((item) => item.assemblyKind === "BOARD_ELECTION");
  const runoffAttended = approved.some((item) => item.assemblyKind === "RUNOFF");
  const missing: AssemblyKind[] = [];
  if (
    ordinaryAttended + excused.filter((item) => item.assemblyKind === "ORDINARY").length <
    requirement.requiredOrdinary
  ) {
    missing.push("ORDINARY");
  }
  if (
    requirement.requiresBoardElection &&
    !boardElectionAttended &&
    !excused.some((item) => item.assemblyKind === "BOARD_ELECTION")
  ) {
    missing.push("BOARD_ELECTION");
  }
  if (
    requirement.requiresRunoff &&
    !runoffAttended &&
    !excused.some((item) => item.assemblyKind === "RUNOFF")
  ) {
    missing.push("RUNOFF");
  }
  return {
    ordinaryAttended,
    boardElectionAttended,
    runoffAttended,
    compliant: missing.length === 0,
    missing,
    attendedTotal: approved.length,
  };
}

/**
 * Lo que las dos cuentas de «{n} de {total}» leen del requisito y de lo firmado, y nada más: así las
 * llama también quien no tiene el requisito ni el cumplimiento enteros, como `permanence`, que lee lo
 * que guardó en su snapshot (ADR-129 regla 4).
 */
type RequiredAssemblies = Pick<
  AssemblyRequirementView,
  "requiredOrdinary" | "requiresBoardElection" | "requiresRunoff"
>;
type SignedAssemblies = Pick<
  AssemblyCompliance,
  "ordinaryAttended" | "boardElectionAttended" | "runoffAttended"
>;

/** Cuántas asambleas exige el requisito en total (ordinarias más elección y segunda vuelta si aplican). */
export function requiredTotal(requirement: RequiredAssemblies): number {
  return (
    requirement.requiredOrdinary +
    (requirement.requiresBoardElection ? 1 : 0) +
    (requirement.requiresRunoff ? 1 : 0)
  );
}

/**
 * Cuántas de las asambleas que exige el requisito lleva firmadas la persona: la `n` de «{n} de
 * {total}», con `requiredTotal` como total. Es el único sitio que hace esta cuenta: la llaman GH
 * Points y el Resumen de la Persona 360 (ADR-128 regla 4), y `permanence`, por `mandatoryCounts`,
 * para el Desglose, la mesa de cumplimiento y su CSV (ADR-129 regla 4). Las ordinarias cuentan hasta
 * las que el requisito exige, y la elección de junta y la segunda vuelta solo si las exige: una
 * firmada de más, o una que el requisito ajustado no pide, no suma, así que nunca pasa del total.
 * Firmada es aprobada: una excusa cumple el requisito (`assemblyCompliance`) y no cuenta acá. No
 * valida lo que recibe: las ordinarias exigidas llegan de 0 o más porque así las dejan pasar el
 * término y `adjustRequirement`.
 */
export function attendedRequired(
  requirement: RequiredAssemblies,
  compliance: SignedAssemblies,
): number {
  return (
    Math.min(compliance.ordinaryAttended, requirement.requiredOrdinary) +
    (requirement.requiresBoardElection && compliance.boardElectionAttended ? 1 : 0) +
    (requirement.requiresRunoff && compliance.runoffAttended ? 1 : 0)
  );
}
