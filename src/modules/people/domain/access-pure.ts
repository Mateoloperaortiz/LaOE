import type { MembershipStatus } from "./reads";

/** Entrar en Mi OE no habilita la participación ni la emisión de credenciales. */
export function canParticipate(status: MembershipStatus | null | undefined): boolean {
  return status === "ACTIVE" || status === "HONORARY";
}
