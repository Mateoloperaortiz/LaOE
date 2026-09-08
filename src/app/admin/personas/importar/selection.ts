import { createHash } from "node:crypto";

// La URL de retorno guarda posiciones, nunca correos. La huella impide que una posición
// seleccione otra persona si alguien modifica el mapeo durante la verificación por OTP.
type Proposal = { email: string; committeeId: string };

export function proposalSelectionVersion(proposals: readonly Proposal[]): string {
  return createHash("sha256")
    .update(JSON.stringify(proposals.map((item) => [item.email, item.committeeId])))
    .digest("hex");
}

export function parseProposalIndexes(value: string): number[] {
  return [
    ...new Set(
      value
        .split(",")
        .filter((item) => /^(0|[1-9]\d*)$/.test(item))
        .map(Number),
    ),
  ].filter((index) => Number.isSafeInteger(index) && index >= 0);
}
