// Requisito de asambleas por persona y término (ADR-024, ADR-028, ADR-035 regla 12): derivado del
// término salvo ajuste individual; el cumplimiento se calcula, nunca se persiste.

import type { AssemblyKind } from "./occasion-pure";

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
 * término, en cualquier semestre (Regl. art. 60 y 63; Est. art. 7.9; ADR-060 regla 13).
 */
export function defaultRequirement(
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

/** Cuántas asambleas exige el requisito en total (ordinarias más elección y segunda vuelta si aplican). */
export function requiredTotal(requirement: AssemblyRequirementView): number {
  return (
    requirement.requiredOrdinary +
    (requirement.requiresBoardElection ? 1 : 0) +
    (requirement.requiresRunoff ? 1 : 0)
  );
}
