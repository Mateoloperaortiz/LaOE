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

/** Una ordinaria por defecto; en segundo semestre además la elección y la segunda vuelta si existe. */
export function defaultRequirement(
  term: { semester: number; requiredOrdinaryAssemblies: number },
  hasRunoff: boolean,
): AssemblyRequirementView {
  return {
    requiredOrdinary: term.requiredOrdinaryAssemblies,
    requiresBoardElection: term.semester === 2,
    requiresRunoff: term.semester === 2 && hasRunoff,
    adjusted: false,
    reason: null,
  };
}

export interface AttendedAssembly {
  assemblyKind: AssemblyKind;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
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
  const ordinaryAttended = approved.filter((item) => item.assemblyKind === "ORDINARY").length;
  const boardElectionAttended = approved.some((item) => item.assemblyKind === "BOARD_ELECTION");
  const runoffAttended = approved.some((item) => item.assemblyKind === "RUNOFF");
  const missing: AssemblyKind[] = [];
  if (ordinaryAttended < requirement.requiredOrdinary) {
    missing.push("ORDINARY");
  }
  if (requirement.requiresBoardElection && !boardElectionAttended) {
    missing.push("BOARD_ELECTION");
  }
  if (requirement.requiresRunoff && !runoffAttended) {
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
