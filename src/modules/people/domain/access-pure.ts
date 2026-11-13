import type { membership } from "../schema";

type MembershipStatus = (typeof membership.$inferSelect)["status"];

/** Entrar en Mi OE no habilita la participación ni la emisión de credenciales. */
export function canParticipate(status: MembershipStatus | null | undefined): boolean {
  return status === "ACTIVE" || status === "HONORARY";
}

/** Con qué entra una persona: como miembro, como egresado (ADR-184) o no entra. */
export type SignInAccess = "MEMBER" | "ALUMNI";

/** Los estados con ingreso de miembro: la licencia conserva la consulta y la autogestión. */
const MEMBER_SIGN_IN: readonly MembershipStatus[] = ["ACTIVE", "ON_LEAVE", "HONORARY"];

/**
 * Quién entra (ADR-184 regla 1): un miembro activo, en licencia u honorario; o un egresado, que salió
 * por grado y no fue anonimizado. Las demás salidas (renuncia, permanencia, expulsión, pérdida de la
 * calidad de estudiante) no vuelven a entrar.
 */
export function signInAccess(state: {
  status: MembershipStatus;
  endReason: string | null;
  anonymizedAt: Date | null;
}): SignInAccess | null {
  if (MEMBER_SIGN_IN.includes(state.status)) return "MEMBER";
  if (state.status === "INACTIVE" && state.endReason === "GRADUATION" && !state.anonymizedAt) {
    return "ALUMNI";
  }
  return null;
}
