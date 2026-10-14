import { attendedRequired, requiredTotal } from "@/modules/participation";
import type { MandatoryView } from "./permanence-pure";

/**
 * Cuántas asambleas obligatorias lleva firmadas la persona y de cuántas, sobre lo que `permanence`
 * calculó o guardó de ella: el «{n} de {total}» del Desglose (T-124), de la mesa de cumplimiento y de
 * su CSV. No hace la cuenta: le pasa a `attendedRequired` y a `requiredTotal`, de `participation`, lo
 * exigido y lo firmado con los nombres que ellas leen (ADR-129 regla 4). La fuente sigue siendo la de
 * `permanence`: el resultado en vivo o el snapshot, congelado o sin recalcular.
 */
export function mandatoryCounts(mandatory: MandatoryView): { attended: number; total: number } {
  const requirement = {
    requiredOrdinary: mandatory.required.ordinary,
    requiresBoardElection: mandatory.required.boardElection,
    requiresRunoff: mandatory.required.runoff,
  };
  return {
    attended: attendedRequired(requirement, {
      ordinaryAttended: mandatory.attended.ordinary,
      boardElectionAttended: mandatory.attended.boardElection,
      runoffAttended: mandatory.attended.runoff,
    }),
    total: requiredTotal(requirement),
  };
}
