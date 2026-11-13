import type { MembershipStatus, SignInAccess } from "@/modules/people";

export interface ActorPermission {
  code: "ADMIN" | "COMMITTEE_LEADER" | "BOARD";
  committeeId: string | null;
}

/** La persona autenticada con sus permisos, validada en servidor (ADR-011). */
export interface Actor {
  personId: string;
  sessionId: string;
  email: string;
  name: string;
  firstName: string;
  membershipStatus: MembershipStatus;
  /** Entra como miembro o como egresado (ADR-184): el egresado ve solo las rutas de su red. */
  access: SignInAccess;
  permissions: ActorPermission[];
  otpVerifiedAt: Date;
  sessionLastSeenAt: Date;
  sessionRemembered: boolean;
  isAdmin: boolean;
}
